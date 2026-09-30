# mangools-api-client

Typed TypeScript client for the [Mangools API](https://mangools.com/api) — KWFinder, SERPChecker, SERPWatcher, LinkMiner, SiteProfiler and AI Search Watcher.

> **Early access, generated client.** This package is `0.x`. Every type in it is generated from the published OpenAPI description, so the shape of the API is the shape of the SDK; where the description is still thin, the types are still thin. Any `0.x` release may contain breaking changes.

- **Spec:** generated from the OpenAPI description served at `https://api.mangools.com/v3/openapi.json`. The description is not stored in this repository. Each release ships the copy it was built from as `spec/openapi.json` inside the package, and exports its SHA-256 as `SPEC_SHA256`.
- **Documentation:** <https://apidocs.mangools.com>
- **Generated with:** [`openapi-typescript`](https://openapi-ts.dev) + [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/). No hand-written request or model code.
- **Runtime:** `fetch`. Node 18+, Deno, Bun and edge runtimes. ESM and CJS. Call the API from server-side code: it does not accept cross-origin browser requests, and a key in browser code is visible to every visitor.

## Install

```sh
npm install mangools-api-client
```

## Hello world

Get a Mangools API key at <https://mangools.com/api-token> and export it:

```sh
export MANGOOLS_API_KEY='…'
```

```ts
import { MangoolsClient } from 'mangools-api-client';

const apiKey = process.env.MANGOOLS_API_KEY;
if (!apiKey) {
  throw new Error('Set MANGOOLS_API_KEY — get a key at https://mangools.com/api-token');
}

const mangools = new MangoolsClient({ apiKey });

const keywords = await mangools.GET('/kwfinder/related-keywords', {
  params: { query: { kw: 'seo tools', location_id: 0, language_id: 0 } },
});

if (keywords.error) {
  console.error('KWFinder failed:', keywords.error.error.type, keywords.error.error.message);
} else {
  for (const keyword of keywords.data.keywords?.slice(0, 5) ?? []) {
    console.log(`${keyword.kw}\tsv=${keyword.sv}\tcpc=${keyword.cpc}\tkd=${keyword.seo}`);
  }
}

const monitors = await mangools.GET('/aiwatcher/monitors');

if (monitors.error) {
  console.error('AI Search Watcher failed:', monitors.error.error.type, monitors.error.error.message);
} else {
  for (const monitor of monitors.data.monitors ?? []) {
    console.log(`${monitor.brand}\t${monitor.domain}`);
  }
}
```

The same example, importing from `../src`, is at [`examples/hello-world.ts`](./examples/hello-world.ts) and is type-checked in CI.

## Authentication

The Mangools API authenticates with an account API key in the **`x-access-token`** request header. It is not an OAuth bearer token and `Authorization: Bearer …` will not work.

```ts
const mangools = new MangoolsClient({ apiKey: process.env.MANGOOLS_API_KEY! });
```

The client sets the header on every request. The header name is not hard-coded — it is read out of the spec's `apiKey` security scheme at generation time and re-exported so you can assert on it:

```ts
import { API_KEY_HEADER } from 'mangools-api-client'; // 'x-access-token'
```

## Base URL and the `/v3` prefix

`servers[0].url` in the spec is `https://api.mangools.com/v3` and every path is declared **without** a version segment (`/kwfinder/related-keywords`, `/aiwatcher/monitors`). They compose to `https://api.mangools.com/v3/aiwatcher/monitors`. There is no path rewriting anywhere in this SDK, and `scripts/smoke.mjs` asserts the composed URL in CI.

Point the client somewhere else with `baseUrl`:

```ts
new MangoolsClient({ apiKey, baseUrl: 'https://api-mock.example.com/v3' });
```

## Usage

Methods are the HTTP verbs; the first argument is the spec path, and the request and response types follow from it. There is no invented method naming layer to learn.

```ts
const { data, error, response } = await mangools.GET('/aiwatcher/monitors');
```

Requests do not throw on HTTP errors. A successful response sets `data`, a failed one sets `error`, and a response without a body, such as a 204, leaves both `undefined`. For JSON errors, `error` is the API's canonical error envelope:

```ts
if (error) {
  // error.error.type        — 'AuthError' | 'ValidationError' | 'RateLimit' | 'Error' | …
  // error.error.message     — human readable
  // error.error.errors      — validation messages, on 422
  // error.error.retry_after — seconds to wait, on 429
}
```

Network and abort failures still reject, as with `fetch`.

> **Not every endpoint answers with the envelope.** `error` is typed from the responses the spec documents. Where the only documented failure is a rate-limit page served by the gateway, the gateway answers `text/html` and `error` is that page as a `string`, or `undefined` when the response has no body. Reading `error.error` on such an endpoint is a compile error; `response.status` is the thing to branch on.

Path and query parameters, and request bodies, go under `params` and `body`:

```ts
await mangools.GET('/serpwatcher/trackings/{tracking_id}/detail', {
  params: { path: { tracking_id: '…' } },
});

await mangools.POST('/aiwatcher/monitor', {
  body: {
    brand: 'Mangools',
    domain: 'mangools.com',
    location_id: 2840,
    platform_id: 1,
    models: [1],
    prompts: ['best seo tools'],
  },
});
```

`models` takes the numeric `id` values that `GET /aiwatcher/models` returns.

Model types come from the spec and are exported:

```ts
import type { Schemas, MangoolsError, components, operations, paths } from 'mangools-api-client';

type Keyword = Schemas['Keyword'];
type Monitor = Schemas['AIMonitorDashboard'];
```

Every operation carries an `operationId`, so `operations` is keyed by it and you can name a single operation's request and response types. Most ids are tool-prefixed kebab-case, which is not a valid TypeScript identifier, so index with a string literal.

```ts
type Monitors = operations['get-aiwatcher-monitors']['responses'][200]['content']['application/json'];
```

`use()` / `eject()` take [openapi-fetch middleware](https://openapi-ts.dev/openapi-fetch/middleware-auth) if you need logging, tracing or your own retry policy:

```ts
import type { Middleware } from 'mangools-api-client';

const timing: Middleware = {
  async onResponse({ request, response }) {
    console.log(request.method, request.url, response.status);
  },
};
mangools.use(timing);
```

## Building from source

Nothing generated is committed. The build downloads the live API description into `spec/openapi.json` and generates `src/generated/` from it. Both paths are gitignored. A build that cannot download the description fails; there is no fallback copy.

```sh
npm ci
npm run build       # fetch the spec, generate src/generated/, bundle dist/
npm run verify:live # fetch, then lint the spec, typecheck, build, smoke test, pack, zero-any gate
```

`SPEC_URL` overrides the address the description is fetched from.

## Releases

A scheduled workflow fetches the live description every day, compares it with the copy shipped in the latest npm release, and publishes a new version only when the two differ. A change that [oasdiff](https://github.com/oasdiff/oasdiff) reports as breaking bumps the minor version, anything else bumps the patch version. The changes are listed in the [GitHub Release](https://github.com/mangools/api-client-typescript/releases).

## The zero-`any` gate

`npm run check:no-any` asserts that **no** field type in the emitted `.d.ts` is `any`, `unknown`, `object`, `Record<string, any>`, `Record<string, never>`, `unknown[]` or `any[]`.

Three emissions are reported and do not fail, and each one is identified by the spec node behind it rather than by the emitted text:

| Emission | Why it takes nothing away from the caller |
| --- | --- |
| `headers: { [name: string]: unknown }` | `openapi-typescript` puts one on every response object because OpenAPI cannot express "and no other headers". The gate counts them and asserts the count equals the number of responses documented in the spec, so the exemption cannot quietly absorb a new hole. |
| `Record<string, never>` from `additionalProperties: false` with no properties | The closed type for a body that really is empty. A schema that declares nothing at all emits the same text and still fails, which is why the spec node decides. |
| `T & unknown` | `X & unknown` is `X` in TypeScript. It is how the `allOf: [{$ref}, {description}]` idiom, the only way OpenAPI 3.0 can annotate a `$ref`, comes out. In a union the same `unknown` would swallow every other member, so the gate checks that the parent really is an intersection. |

The gate runs in CI against the live description and before every release. The reasons are not a hand-maintained list: `scripts/check-no-any.mjs` walks the spec for the nodes that force an untyped emission and joins them to the AST hits by path; the two sets must be identical. An emitted position with no spec node fails the gate, and so does a spec node that emits nothing.

The gate still cannot see a schema that is typed but wrong. It is a floor, not a proof of fidelity.

## Support

This repository is maintained by the Mangools team and does not accept external pull requests or issues. Please send questions and bug reports to support@mangools.com.

## License

[Apache-2.0](./LICENSE)
