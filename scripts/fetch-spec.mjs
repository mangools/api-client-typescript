#!/usr/bin/env node
// Downloads the live API description into spec/openapi.json, which is gitignored.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchLiveSpec } from './lib/spec.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

try {
  const { url, text, sha256 } = await fetchLiveSpec();
  await mkdir(resolve(root, 'spec'), { recursive: true });
  await writeFile(resolve(root, 'spec/openapi.json'), text);
  console.log(`fetched ${url} -> spec/openapi.json (sha256 ${sha256})`);
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exit(1);
}
