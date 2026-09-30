// Every code block in README.md, compiled. Not published — it exists so that a
// regenerated spec that changes a documented shape fails CI instead of the README.
import { MangoolsClient, API_KEY_HEADER } from '../src/index.js';
import type { Middleware, Schemas, MangoolsError, components, operations, paths } from '../src/index.js';

const apiKey = 'placeholder';
const mangools = new MangoolsClient({ apiKey });
new MangoolsClient({ apiKey, baseUrl: 'https://api-mock.example.com/v3' });

const header: string = API_KEY_HEADER;

const { data, error, response } = await mangools.GET('/aiwatcher/monitors');
if (error) {
  const t: string = error.error.type;
  const m: string = error.error.message;
  const v: string[] | undefined = error.error.errors;
  const r: number | undefined = error.error.retry_after;
  console.log(t, m, v, r);
}
console.log(data, response.status);

// Where the only documented failure is the gateway's HTML 429, `error` is a string, not
// the JSON envelope; branch on the status instead.
const locations = await mangools.GET('/mangools/locations', { params: { query: { query: 'praha' } } });
if (!locations.response.ok) {
  console.error('locations failed:', locations.response.status);
}

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

type Keyword = Schemas['Keyword'];
type Monitor = Schemas['AIMonitorDashboard'];
type Monitors = operations['get-aiwatcher-monitors']['responses'][200]['content']['application/json'];
declare const mons: Monitors;
console.log(mons);
declare const k: Keyword; declare const mo: Monitor; declare const e: MangoolsError;
declare const c1: components; declare const o1: operations; declare const p1: paths;
console.log(header, k, mo, e, c1, o1, p1);

const timing: Middleware = {
  async onResponse({ request, response }) {
    console.log(request.method, request.url, response.status);
  },
};
mangools.use(timing);
