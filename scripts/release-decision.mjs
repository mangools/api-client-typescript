#!/usr/bin/env node
// Decides whether the live API description warrants a new release of this package.
//
//   node scripts/release-decision.mjs --dry-run   print the decision, touch nothing
//   node scripts/release-decision.mjs             also write spec/openapi.json, release-notes.md
//                                                 and, under GitHub Actions, the step outputs
//
// A build is identified by the sha256 of its normalised spec, never by `info.version`, which stays
// the same when the content changes. The shipped spec is read out of the published tarball.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchLiveSpec, normalise, sha256 } from './lib/spec.mjs';

const OASDIFF = process.env.OASDIFF || 'oasdiff';
const PACKAGE = 'mangools-api-client';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');

async function latestPublished() {
  const response = await fetch(`https://registry.npmjs.org/${PACKAGE}/latest`);
  if (!response.ok) throw new Error(`npm registry answered HTTP ${response.status} for ${PACKAGE}@latest`);
  const { version, dist } = await response.json();
  return { version, tarball: dist.tarball };
}

async function shippedSpec(tarballUrl, dir) {
  const response = await fetch(tarballUrl);
  if (!response.ok) throw new Error(`npm registry answered HTTP ${response.status} for ${tarballUrl}`);
  const tarball = join(dir, 'shipped.tgz');
  await writeFile(tarball, Buffer.from(await response.arrayBuffer()));
  const text = execFileSync('tar', ['-xzOf', tarball, 'package/spec/openapi.json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return normalise(text);
}

function oasdiff(args, dir) {
  const result = spawnSync(OASDIFF, args, { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw new Error(`oasdiff is not installed or cannot run: ${result.error.message}`);
  return result;
}

function nextVersion(current, breaking) {
  const [major, minor, patch] = current.split('.').map(Number);
  return breaking ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
}

function report(fields) {
  const width = Math.max(...Object.keys(fields).map((k) => k.length));
  for (const [key, value] of Object.entries(fields)) console.log(`${key.padEnd(width)}  ${value}`);
}

async function decide(work) {
  const live = await fetchLiveSpec();
  const latest = await latestPublished();
  const shipped = await shippedSpec(latest.tarball, work);
  const shippedSha = sha256(shipped);

  const fields = {
    'latest published version': latest.version,
    'shipped spec sha256': shippedSha,
    'live spec sha256': live.sha256,
  };

  if (shippedSha === live.sha256) {
    report({ ...fields, 'breaking': 'n/a', 'next version': 'n/a', decision: 'nothing to release' });
    if (!dryRun && process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'release=false\n');
    return;
  }

  await writeFile(join(work, 'shipped.json'), shipped);
  await writeFile(join(work, 'live.json'), live.text);

  const breakingRun = oasdiff(['breaking', 'shipped.json', 'live.json', '--fail-on', 'ERR'], work);
  if (breakingRun.status !== 0 && breakingRun.status !== 1) {
    throw new Error(`oasdiff failed (exit ${breakingRun.status}): ${breakingRun.stderr || breakingRun.stdout}`);
  }
  const breaking = breakingRun.status === 1;

  const changelogRun = oasdiff(['changelog', 'shipped.json', 'live.json'], work);
  if (changelogRun.status !== 0) {
    throw new Error(`oasdiff changelog failed (exit ${changelogRun.status}): ${changelogRun.stderr || changelogRun.stdout}`);
  }
  const changelog = changelogRun.stdout.trim() || 'The API description changed without any change oasdiff reports.';

  const version = nextVersion(latest.version, breaking);
  report({
    ...fields,
    breaking: breaking ? 'yes' : 'no',
    'next version': version,
    decision: dryRun ? `would release ${version}` : `release ${version}`,
  });

  if (dryRun) {
    console.log(`\nchangelog (${changelog.split('\n').length} lines):\n${changelog.split('\n').slice(0, 15).join('\n')}`);
    return;
  }

  await mkdir(resolve(root, 'spec'), { recursive: true });
  await writeFile(resolve(root, 'spec/openapi.json'), live.text);
  const notes =
    `Built from the API description with sha256 \`${live.sha256}\`, replacing \`${shippedSha}\` (${latest.version}).\n\n` +
    `Breaking changes: ${breaking ? 'yes' : 'no'}.\n\n## Changes\n\n\`\`\`\n${changelog}\n\`\`\`\n`;
  await writeFile(resolve(root, 'release-notes.md'), notes);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `release=true\nversion=${version}\nbreaking=${breaking}\n`);
  }
}

const work = await mkdtemp(join(tmpdir(), 'mangools-release-'));
try {
  await decide(work);
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exitCode = 1;
} finally {
  await rm(work, { recursive: true, force: true });
}
