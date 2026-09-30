import { MangoolsClient } from '../src/index.js';

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
