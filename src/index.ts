export { MangoolsClient, type MangoolsClientOptions, type Middleware } from './client.js';
export { API_KEY_HEADER } from './generated/auth.js';
export { DEFAULT_BASE_URL, SPEC_SHA256, SPEC_VERSION } from './generated/server.js';
export type { components, operations, paths } from './generated/schema.js';

import type { components } from './generated/schema.js';

/** Named response/request models from `components.schemas`, e.g. `Schemas['Keyword']`. */
export type Schemas = components['schemas'];

/** The API's JSON error envelope. The gateway's HTML 429 page does not use it. */
export type MangoolsError = components['schemas']['Error'];
