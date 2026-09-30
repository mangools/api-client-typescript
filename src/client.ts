import createClient, { type ClientOptions, type Client, type Middleware } from 'openapi-fetch';
import type { paths } from './generated/schema.js';
import { API_KEY_HEADER } from './generated/auth.js';
import { DEFAULT_BASE_URL } from './generated/server.js';

export interface MangoolsClientOptions {
  /**
   * Mangools account API key, sent in the `x-access-token` header.
   * Get one at https://mangools.com/api-token.
   */
  apiKey: string;
  /** Overrides the server from the spec. Defaults to `https://api.mangools.com/v3`. */
  baseUrl?: string;
  /** Custom `fetch` implementation. Defaults to the global one. */
  fetch?: ClientOptions['fetch'];
  /** Extra headers merged into every request. */
  headers?: Record<string, string>;
}

/**
 * Typed client for the Mangools API.
 *
 * Every method is keyed by the spec path, so the request and response types
 * come straight from the OpenAPI description:
 *
 * ```ts
 * const mangools = new MangoolsClient({ apiKey: process.env.MANGOOLS_API_KEY! });
 * const { data, error } = await mangools.GET('/kwfinder/related-keywords', {
 *   params: { query: { kw: 'seo tools' } },
 * });
 * ```
 */
export class MangoolsClient {
  readonly baseUrl: string;

  readonly GET: Client<paths>['GET'];
  readonly PUT: Client<paths>['PUT'];
  readonly POST: Client<paths>['POST'];
  readonly DELETE: Client<paths>['DELETE'];
  readonly OPTIONS: Client<paths>['OPTIONS'];
  readonly HEAD: Client<paths>['HEAD'];
  readonly PATCH: Client<paths>['PATCH'];
  readonly TRACE: Client<paths>['TRACE'];

  /** Registers an openapi-fetch middleware (logging, tracing, custom retries). */
  readonly use: Client<paths>['use'];
  /** Removes a previously registered middleware. */
  readonly eject: Client<paths>['eject'];

  constructor(options: MangoolsClientOptions) {
    if (!options.apiKey) {
      throw new Error('MangoolsClient requires an apiKey — get one at https://mangools.com/api-token');
    }

    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;

    const client = createClient<paths>({
      baseUrl: this.baseUrl,
      headers: { ...options.headers, [API_KEY_HEADER]: options.apiKey },
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });

    this.GET = client.GET;
    this.PUT = client.PUT;
    this.POST = client.POST;
    this.DELETE = client.DELETE;
    this.OPTIONS = client.OPTIONS;
    this.HEAD = client.HEAD;
    this.PATCH = client.PATCH;
    this.TRACE = client.TRACE;
    this.use = client.use;
    this.eject = client.eject;
  }
}

export type { Middleware };
