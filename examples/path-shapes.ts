// Compile-time checks that the client exposes the documented path shapes.
// Each `@ts-expect-error` asserts that a shape the API does not define is absent: if the
// spec ever defined it, the directive would go unused and `tsc` would fail on TS2578, so
// this file fails in both directions.
import { MangoolsClient } from '../src/index.js';

const mangools = new MangoolsClient({ apiKey: 'placeholder' });

// The list-keyword operations use the plural path `/kwfinder/lists/{list_id}/keywords`.
await mangools.POST('/kwfinder/lists/{list_id}/keywords', {
  params: { path: { list_id: 'l' } },
  body: { keyword_ids: ['916647301d98e2ec41df257cbdf97ac0'] },
});
// @ts-expect-error the API defines no singular path
await mangools.POST('/kwfinder/lists/{list_id}/keyword', { params: { path: { list_id: 'l' } } });

await mangools.DELETE('/kwfinder/lists/{list_id}/keywords', {
  params: { path: { list_id: 'l' } },
  body: { keyword_ids: ['916647301d98e2ec41df257cbdf97ac0'] },
});
// @ts-expect-error the API defines no singular path
await mangools.DELETE('/kwfinder/lists/{list_id}/keyword', { params: { path: { list_id: 'l' } } });

// Updating a tracking uses PATCH; the API defines no PUT on this path.
await mangools.PATCH('/serpwatcher/trackings/{tracking_id}', {
  params: { path: { tracking_id: 't' } },
  body: { domain: 'mangools.com' },
});
// @ts-expect-error the API defines no PUT on this path
await mangools.PUT('/serpwatcher/trackings/{tracking_id}', { params: { path: { tracking_id: 't' } } });

// Deleting a tag takes the tag in the path, not the query string.
await mangools.DELETE('/serpwatcher/trackings/{tracking_id}/tags/{tag_id}', {
  params: { path: { tracking_id: 't', tag_id: 'g' } },
});
// @ts-expect-error tag_id is a path segment
await mangools.DELETE('/serpwatcher/trackings/{tracking_id}/tags', { params: { path: { tracking_id: 't' } } });

// `kwIds` is read from the request body, not the query string.
await mangools.POST('/serpwatcher/trackings/{tracking_id}/stats', {
  params: { path: { tracking_id: 't' }, query: { from: '2026-01-01', to: '2026-02-01' } },
  body: { kwIds: ['a', 'b'] },
});
await mangools.POST('/serpwatcher/trackings/{tracking_id}/stats', {
  // @ts-expect-error kwIds is not a query parameter
  params: { path: { tracking_id: 't' }, query: { kwIds: ['a'] } },
  body: {},
});

// The AI Search Watcher surface is reachable by path, and its payload is typed down to
// the leaf values, with no cast and no `as`.
const monitors = await mangools.GET('/aiwatcher/monitors');
if (!monitors.error) {
  const brands: (string | undefined)[] = (monitors.data.monitors ?? []).map((m) => m.brand);
  const state: 'active' | 'warned' | 'paused' | undefined = monitors.data.monitors?.[0]?.monitoring_state;
  console.log(brands, state);
}
await mangools.GET('/aiwatcher/monitor/{id}/settings', { params: { path: { id: 'm' } } });
await mangools.DELETE('/aiwatcher/monitor/{id}', { params: { path: { id: 'm' } } });

// `/kwfinder/limits` answers 200 without a key, so it is not a credential check.
// Its only documented failure is the gateway's 429, which answers `text/html`.
const limits = await mangools.GET('/kwfinder/limits');
if (limits.error) {
  const page: string = limits.error;
  // @ts-expect-error the gateway 429 body is the HTML page, not the JSON envelope
  console.log(limits.error.error.message);
  console.log(page.length);
}
console.log(limits.response.status);

// `SPMetrics.fb` is the one metric block that really is nullable. `null` is assignable to
// it, and reaching a leaf without checking does not compile — with no cast either way.
const overview = await mangools.GET('/siteprofiler/overview', {
  params: { query: { url: 'mangools.com' } },
});
if (!overview.error) {
  const nullIsAssignable: (typeof overview.data)['fb'] = null;
  const checked = overview.data.fb ?? null;
  // @ts-expect-error `fb` is `FacebookMetricValue | null | undefined`
  console.log(overview.data.fb.l);
  console.log(nullIsAssignable, checked?.l ?? null);
}
