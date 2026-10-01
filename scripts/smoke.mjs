#!/usr/bin/env node
// Installs the packed tarball into a throwaway consumer and loads it through both
// `require` and `import`, so the `exports` map and the `files` list are exercised the
// way npm will resolve them rather than the way the local source tree happens to.
// A stub fetch stands in for the API — the assertions are about wiring, not data.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, symlinkSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'mangools-smoke-'));
const spec = JSON.parse(readFileSync(join(root, 'spec', 'openapi.json'), 'utf8'));
const BASE_URL = spec.servers[0].url;
const HEADER = Object.values(spec.components.securitySchemes).find((s) => s.type === 'apiKey').name;

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

try {
  run('npm', ['pack', '--silent', '--pack-destination', work], root);
  const tarball = readdirSync(work).find((f) => f.endsWith('.tgz'));
  if (!tarball) throw new Error('npm pack produced no tarball');

  const modules = join(work, 'node_modules');
  const installed = join(modules, 'mangools-api-client');
  mkdirSync(installed, { recursive: true });
  run('tar', ['-xzf', join(work, tarball), '-C', installed, '--strip-components=1'], work);
  symlinkSync(join(root, 'node_modules', 'openapi-fetch'), join(modules, 'openapi-fetch'), 'dir');
  symlinkSync(
    join(root, 'node_modules', 'openapi-typescript-helpers'),
    join(modules, 'openapi-typescript-helpers'),
    'dir',
  );

  const assertions = `
    const calls = [];
    const stubFetch = async (request) => {
      calls.push(request);
      return new Response('{"monitors":[]}', { status: 200, headers: { 'content-type': 'application/json' } });
    };

    const client = new MangoolsClient({ apiKey: 'placeholder-key', fetch: stubFetch });
    assert.equal(client.baseUrl, ${JSON.stringify(BASE_URL)});
    assert.equal(API_KEY_HEADER, ${JSON.stringify(HEADER)});
    assert.equal(DEFAULT_BASE_URL, ${JSON.stringify(BASE_URL)});

    const { data, error } = await client.GET('/aiwatcher/monitors');
    assert.equal(error, undefined);
    assert.deepEqual(data, { monitors: [] });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, ${JSON.stringify(BASE_URL + '/aiwatcher/monitors')});
    assert.equal(calls[0].headers.get(${JSON.stringify(HEADER)}), 'placeholder-key');
    assert.equal(calls[0].headers.get('authorization'), null);

    assert.throws(() => new MangoolsClient({ apiKey: '' }), /requires an apiKey/);
  `;

  writeFileSync(
    join(work, 'esm.mjs'),
    `import assert from 'node:assert/strict';
import { MangoolsClient, API_KEY_HEADER, DEFAULT_BASE_URL } from 'mangools-api-client';
${assertions}
console.log('  esm  import mangools-api-client — ok');
`,
  );

  writeFileSync(
    join(work, 'cjs.cjs'),
    `const assert = require('node:assert/strict');
const { MangoolsClient, API_KEY_HEADER, DEFAULT_BASE_URL } = require('mangools-api-client');
(async () => {
${assertions}
console.log('  cjs  require("mangools-api-client") — ok');
})();
`,
  );

  process.stdout.write(run('node', [join(work, 'esm.mjs')], work));
  process.stdout.write(run('node', [join(work, 'cjs.cjs')], work));
  console.log('smoke test passed.');
} finally {
  rmSync(work, { recursive: true, force: true });
}
