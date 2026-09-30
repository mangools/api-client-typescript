import { createHash } from 'node:crypto';

export const DEFAULT_SPEC_URL = 'https://api.mangools.com/v3/openapi.json';

/** The server serves minified JSON; every consumer works on the indented form so the bytes are comparable. */
export function normalise(text) {
  return JSON.stringify(JSON.parse(text), null, 2) + '\n';
}

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

export async function fetchLiveSpec() {
  const url = process.env.SPEC_URL || DEFAULT_SPEC_URL;
  let response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw new Error(`Cannot fetch the API description from ${url}: ${cause.message}. The build needs it and has no fallback copy.`);
  }
  if (!response.ok) {
    throw new Error(`Cannot fetch the API description from ${url}: HTTP ${response.status}. The build needs it and has no fallback copy.`);
  }
  let text;
  try {
    text = normalise(await response.text());
  } catch (cause) {
    throw new Error(`${url} did not return valid JSON: ${cause.message}`);
  }
  const document = JSON.parse(text);
  if (typeof document?.openapi !== 'string' || !document.paths || Object.keys(document.paths).length === 0) {
    throw new Error(`${url} did not return an OpenAPI document (no "openapi" version or no paths).`);
  }
  return { url, text, sha256: sha256(text) };
}
