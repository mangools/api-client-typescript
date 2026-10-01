#!/usr/bin/env node
// The "zero any" gate. Every untyped position in the emitted types is a
// hole in spec/openapi.json, except three kinds that are reported without failing. First, openapi-typescript emits a
// fixed `headers: { [name: string]: unknown }` bag on every response object because
// OpenAPI cannot express "no other headers". That bag is counted against the spec's
// own response count rather than excluded, so it cannot absorb a real regression.
//
// A schema that declares `additionalProperties: false` and no properties is reported
// but does not fail. `Record<string, never>` is the closed type for a body the API
// really returns empty: an unknown Mangools rank, and the body of a deleted AI Search
// Watcher monitor. An object that declares nothing at all emits the same text and
// still fails, which is why the two are told apart by the spec node rather than by
// the emitted type.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = ['dist/index.d.ts', 'dist/index.d.cts', 'src/generated/schema.ts'];

// Four base patterns, plus three tightenings for what openapi-typescript writes when
// the spec declares no properties or no items: `Record<string, never>`, `unknown[]`
// and `any[]`, none of which the first four patterns catch.
const TEXT_PATTERNS = [
  ': any',
  ': unknown',
  ': object',
  'Record<string, any>',
  'Record<string, never>',
  'unknown[]',
  'any[]',
];

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

/** Number of response objects openapi-typescript will emit a headers bag for. */
function expectedHeaderBags(spec) {
  let inline = 0;
  for (const item of Object.values(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(item)) {
      if (!METHODS.includes(method)) continue;
      for (const response of Object.values(operation.responses ?? {})) {
        if (!response.$ref) inline += 1;
      }
    }
  }
  return inline + Object.keys(spec.components?.responses ?? {}).length;
}

/** How openapi-typescript writes an object key: bare when it is a valid identifier or an integer. */
function keyText(name) {
  return /^([A-Za-z_$][A-Za-z0-9_$]*|\d+)$/.test(name) ? name : JSON.stringify(name);
}

/**
 * Every schema node the spec forces openapi-typescript to render untyped, keyed by the
 * same dotted path `enclosingPath` derives from the emitted AST, and labelled with the
 * reason the spec gives. The labels never change the verdict — they only say which kind
 * of gap each surviving position is, because `Record<string, never>` is emitted both for
 * "declares no type" and for "provably has no properties" and the emitted text cannot
 * tell those apart. The two sides are reconciled below and must agree exactly.
 */
function untypedSpecNodes(spec) {
  const found = new Map();
  const note = (path, reason) => found.set(path, reason);

  const descend = (node, path, inComposition = null) => {
    if (!node || typeof node !== 'object' || node.$ref) return;

    const properties = node.properties ?? null;
    const additional = node.additionalProperties;
    const composition = node.allOf ?? node.anyOf ?? node.oneOf ?? null;
    // A non-empty `additionalProperties` schema types the map's tail, so an object with
    // one is described even with no named properties of its own.
    const typedTail = Boolean(
      additional && typeof additional === 'object' && Object.keys(additional).length > 0,
    );
    const described =
      properties || composition || typedTail || node.enum || node.items || node.type;

    if (additional === true || (additional && typeof additional === 'object' && !typedTail)) {
      note(path, properties ? 'open map, named columns typed' : 'open map, nothing typed');
    } else if (node.type === 'object' && !properties && !composition && !typedTail) {
      note(path, additional === false ? 'provably empty' : 'no declared type');
    } else if (!described) {
      note(path, inComposition || 'no declared type');
    }

    for (const [name, child] of Object.entries(properties ?? {})) {
      descend(child, `${path}.${keyText(name)}`);
    }
    if (node.items) descend(node.items, path);
    if (additional && typeof additional === 'object') descend(additional, path);
    const compositionKind = node.allOf
      ? 'inert allOf member, erased by the intersection'
      : 'inert composition member';
    for (const member of composition ?? []) descend(member, path, compositionKind);
  };

  for (const [name, schema] of Object.entries(spec.components?.schemas ?? {})) {
    descend(schema, `components.schemas.${keyText(name)}`);
  }

  const responseBodies = (responses, prefix) => {
    for (const [code, response] of Object.entries(responses ?? {})) {
      if (response.$ref) continue;
      for (const [media, object] of Object.entries(response.content ?? {})) {
        descend(object.schema, `${prefix}.responses.${keyText(code)}.content.${keyText(media)}`);
      }
    }
  };

  for (const [name, response] of Object.entries(spec.components?.responses ?? {})) {
    for (const [media, object] of Object.entries(response.content ?? {})) {
      descend(object.schema, `components.responses.${keyText(name)}.content.${keyText(media)}`);
    }
  }

  for (const item of Object.values(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(item)) {
      if (!METHODS.includes(method)) continue;
      const prefix = `operations.${keyText(operation.operationId ?? method)}`;
      responseBodies(operation.responses, prefix);
      for (const [media, object] of Object.entries(operation.requestBody?.content ?? {})) {
        descend(object.schema, `${prefix}.requestBody.content.${keyText(media)}`);
      }
      for (const parameter of operation.parameters ?? []) {
        descend(parameter.schema, `${prefix}.parameters.${parameter.in}.${keyText(parameter.name)}`);
      }
    }
  }

  return found;
}

function enclosingPath(node) {
  const parts = [];
  for (let n = node; n; n = n.parent) {
    if (ts.isPropertySignature(n) || ts.isPropertyDeclaration(n)) {
      parts.push(n.name.getText());
    } else if (ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) {
      parts.push(n.name.getText());
    }
  }
  return parts.reverse().join('.');
}

/** The openapi-typescript response-headers bag, identified by shape, not by name. */
function isResponseHeadersBag(node) {
  if (node.kind !== ts.SyntaxKind.UnknownKeyword) return false;
  const signature = node.parent;
  if (!signature || !ts.isIndexSignatureDeclaration(signature)) return false;
  const literal = signature.parent;
  if (!literal || !ts.isTypeLiteralNode(literal) || literal.members.length !== 1) return false;
  const property = literal.parent;
  return Boolean(property && ts.isPropertySignature(property) && property.name.getText() === 'headers');
}

/**
 * `X & unknown` is `X` in TypeScript, so an `unknown` standing beside a typed member of an
 * intersection takes nothing away from the caller. It is how openapi-typescript renders the
 * `allOf: [{$ref}, {description}]` idiom OpenAPI 3.0 needs to annotate a `$ref`. In a union
 * the same node would swallow every other member, which is why the parent kind is checked.
 */
function isErasedIntersectionMember(node) {
  const parent = node.parent;
  if (!parent || !ts.isIntersectionTypeNode(parent)) return false;
  return parent.types.some(
    (member) =>
      member !== node &&
      member.kind !== ts.SyntaxKind.UnknownKeyword &&
      member.kind !== ts.SyntaxKind.AnyKeyword,
  );
}

/** `export type webhooks = Record<string, never>` / `$defs` — emitted whether or not the spec uses them. */
function isEmptyTemplateAlias(node) {
  const alias = node.parent;
  if (!alias || !ts.isTypeAliasDeclaration(alias)) return false;
  return alias.name.getText() === 'webhooks' || alias.name.getText() === '$defs';
}

function classify(node) {
  switch (node.kind) {
    case ts.SyntaxKind.AnyKeyword:
      return { pattern: 'any', template: false };
    case ts.SyntaxKind.ObjectKeyword:
      return { pattern: 'object', template: false };
    case ts.SyntaxKind.UnknownKeyword:
      if (isResponseHeadersBag(node)) return { pattern: 'headers-bag', template: true };
      return { pattern: 'unknown', template: false, erased: isErasedIntersectionMember(node) };
    default:
      break;
  }

  if (ts.isArrayTypeNode(node)) {
    const element = node.elementType.kind;
    if (element === ts.SyntaxKind.UnknownKeyword) return { pattern: 'unknown[]', template: false };
    if (element === ts.SyntaxKind.AnyKeyword) return { pattern: 'any[]', template: false };
    return null;
  }

  if (ts.isTypeReferenceNode(node) && node.typeName.getText() === 'Record') {
    const args = node.typeArguments ?? [];
    if (args.length !== 2 || args[0].kind !== ts.SyntaxKind.StringKeyword) return null;
    if (args[1].kind === ts.SyntaxKind.AnyKeyword) return { pattern: 'Record<string, any>', template: false };
    if (args[1].kind === ts.SyntaxKind.NeverKeyword) {
      return { pattern: 'Record<string, never>', template: isEmptyTemplateAlias(node) };
    }
  }

  return null;
}

function scan(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const hits = [];

  const visit = (node) => {
    const verdict = classify(node);
    if (verdict) {
      // `unknown[]` is both an ArrayType hit and an UnknownKeyword hit; keep the outer one.
      const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
      hits.push({ ...verdict, line: line + 1, column: character + 1, path: enclosingPath(node) });
      if (verdict.pattern === 'unknown[]' || verdict.pattern === 'any[]') return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return hits;
}

const spec = JSON.parse(await readFile(resolve(root, 'spec/openapi.json'), 'utf8'));
const expectedBags = expectedHeaderBags(spec);
const specNodes = untypedSpecNodes(spec);
const ERASED_REASON = 'inert allOf member, erased by the intersection';
const toleratedNodes = new Map(
  [...specNodes].filter(([, reason]) => reason === 'provably empty' || reason === ERASED_REASON),
);

console.log(`no-any gate — spec ${spec.info.title} ${spec.info.version}`);
console.log(`expected response-headers bags (one per documented response): ${expectedBags}`);
console.log(`schema nodes the spec leaves untyped (predicted): ${specNodes.size}\n`);

let failed = false;
let mismatched = 0;

/**
 * The emitted untyped positions and the spec's untyped nodes must be the same set. A hit
 * with no spec node means the walk is stale and its labels are lying; a spec node with no
 * hit means the AST classifier stopped recognising a real hole and the gate is silently
 * going green. Either way the two halves have drifted and neither can be trusted.
 */
function reconcile(target, offenders) {
  const emitted = new Set(offenders.map((hit) => hit.path));
  const missing = [...specNodes.keys()].filter((path) => !emitted.has(path));
  if (missing.length === 0) return;
  console.error(`  FAIL: ${missing.length} spec node(s) the walk predicts untyped emit nothing in ${target}:`);
  for (const path of missing) console.error(`      ${path} — ${specNodes.get(path)}`);
  console.error('');
  mismatched += missing.length;
}

for (const target of TARGETS) {
  const file = resolve(root, target);
  if (!existsSync(file)) {
    console.error(`MISSING ${target} — run \`npm run generate && npm run build\` first`);
    failed = true;
    continue;
  }

  const text = await readFile(file, 'utf8');

  console.log(`── ${target} ──`);
  console.log('  literal text occurrences (unfiltered):');
  for (const pattern of TEXT_PATTERNS) {
    const count = text.split(pattern).length - 1;
    console.log(`    ${pattern.padEnd(22)} ${count}`);
  }

  const hits = scan(relative(root, file), text);
  const bags = hits.filter((h) => h.pattern === 'headers-bag');
  const aliases = hits.filter((h) => h.template && h.pattern !== 'headers-bag');
  const emitted = hits.filter((h) => !h.template);
  const isTolerated = (hit) =>
    toleratedNodes.get(hit.path) === 'provably empty' ||
    (toleratedNodes.get(hit.path) === ERASED_REASON && hit.erased === true);
  const closed = emitted.filter(isTolerated);
  const offenders = emitted.filter((hit) => !isTolerated(hit));

  console.log(`  template hits: ${bags.length} response-headers bags, ${aliases.length} empty template aliases`);

  for (const hit of closed) {
    console.log(
      `  not a failure (${toleratedNodes.get(hit.path)}): ${target}:${hit.line}:${hit.column}  ${hit.path}`,
    );
  }

  if (bags.length !== expectedBags) {
    console.error(
      `  FAIL: ${bags.length} response-headers bags but the spec documents ${expectedBags} responses.` +
        ' A bag was added or removed outside the spec — the template floor is no longer accounted for.',
    );
    failed = true;
  }

  if (offenders.length === 0) {
    console.log('  spec-driven untyped positions: 0\n');
    reconcile(target, emitted);
    continue;
  }

  failed = true;
  console.error(`  FAIL: ${offenders.length} spec-driven untyped positions\n`);
  const byPattern = new Map();
  for (const hit of offenders) {
    if (!byPattern.has(hit.pattern)) byPattern.set(hit.pattern, []);
    byPattern.get(hit.pattern).push(hit);
  }
  for (const [pattern, list] of [...byPattern].sort()) {
    console.error(`    ${pattern} (${list.length})`);
    for (const hit of list) {
      const reason = specNodes.get(hit.path) ?? 'UNMATCHED — no such node in the spec';
      console.error(`      ${target}:${hit.line}:${hit.column}  ${hit.path || '<anonymous>'}`);
      console.error(`        ${reason}`);
      if (!specNodes.has(hit.path)) mismatched += 1;
    }
  }
  console.error('');
  reconcile(target, emitted);
}

if (mismatched > 0) {
  console.error(
    `FAIL: the emitted untyped positions and the spec's untyped nodes disagree in\n` +
      `${mismatched} place(s). The reasons printed above are stale — fix the walk in\n` +
      '`untypedSpecNodes`, or the classifier in `classify`, before trusting any of them.\n',
  );
  failed = true;
}

if (failed) {
  console.error(
    'Gate failed. Each position above is a schema in the live API description that declares\n' +
      'no type, no properties or no array items. The fix belongs in the API description.',
  );
  process.exit(1);
}

console.log('no-any gate passed.');
