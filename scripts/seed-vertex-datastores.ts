import Database from 'better-sqlite3';
import { GoogleAuth } from 'google-auth-library';

const BATCH_SIZE = 100;
const PROJECT    = process.env.VERTEX_SEARCH_PROJECT || 'quantika-vertex-search';
const LOCATION   = 'global';
const DB_PATH    = '/root/quantika-demo/data/sessions.db';

const DATASTORE_MAP: Record<string, string> = {
  imsbc: 'quantika-imsbc',
  igc:   'quantika-igc',
  jwc:   'quantika-jwc',
  bimco: 'quantika-bimco',
};

interface FtsRow {
  rowid: number;
  content: string;
  metadata_json: string;
}

function cleanObj(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
}

function buildDoc(source: string, row: FtsRow): { id: string; structData: Record<string, unknown> } {
  const meta: Record<string, unknown> = JSON.parse(row.metadata_json || '{}');

  if (source === 'jwc') {
    return {
      id: `jwc-${row.rowid}`,
      structData: cleanObj({
        content:        row.content,
        source:         'jwc',
        id:             (meta.bulletin_ref as string) || `jwc-${row.rowid}`,
        bulletinId:     (meta.bulletin_ref as string) || `jwc-${row.rowid}`,
        zone_id:        meta.zone_id,
        region:         meta.region,
        effective_from: meta.effective_from,
        confidence:     meta.confidence,
        title:          row.content.split('\n')[0]?.trim() || `JWC Zone ${row.rowid}`,
      }),
    };
  }

  if (source === 'bimco') {
    return {
      id: `bimco-${row.rowid}`,
      structData: cleanObj({
        content:      row.content,
        source:       'bimco',
        id:           (meta.id as string) || `bimco-${row.rowid}`,
        section:      meta.clauseNumber ? String(meta.clauseNumber) : undefined,
        sourceUrl:    meta.sourceUrl,
        title:        meta.title,
        charterParty: meta.charterParty,
      }),
    };
  }

  // imsbc, igc
  return {
    id: `${source}-${row.rowid}`,
    structData: cleanObj({
      content:   row.content,
      source:    (meta.source as string) || source,
      section:   meta.section,
      id:        `${source}-${row.rowid}`,
      sourceUrl: meta.sourceUrl,
      title:     meta.title,
    }),
  };
}

async function waitOperation(opName: string, token: string): Promise<void> {
  const url = `https://discoveryengine.googleapis.com/v1/${opName}`;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const op  = await res.json() as Record<string, unknown>;
    if (op.done) {
      if (op.error) throw new Error(JSON.stringify(op.error));
      const meta = op.metadata as Record<string, unknown> | undefined;
      console.log(`  done — imported: ${meta?.successCount ?? '?'}  failed: ${meta?.failureCount ?? 0}`);
      return;
    }
    process.stdout.write('.');
  }
  console.log('  (timed out — check GCP console for operation status)');
}

async function importBatch(
  source: string,
  docs: Array<{ id: string; structData: Record<string, unknown> }>,
  token: string,
  batchNum: number
): Promise<void> {
  const datastoreId = DATASTORE_MAP[source];
  const url =
    `https://discoveryengine.googleapis.com/v1/projects/${PROJECT}` +
    `/locations/${LOCATION}/collections/default_collection` +
    `/dataStores/${datastoreId}/branches/default_branch/documents:import`;

  const body = {
    inlineSource:       { documents: docs },
    reconciliationMode: 'INCREMENTAL',
  };

  const res = await fetch(url, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Import failed for ${source} batch ${batchNum}: ${res.status} ${text}`);
  }

  const op = await res.json() as Record<string, unknown>;
  process.stdout.write(`  batch ${batchNum} (${docs.length} docs) → ${op.name as string} `);
  if (op.done) {
    console.log('(done immediately)');
  } else {
    await waitOperation(op.name as string, token);
  }
}

async function main() {
  const credFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credFile) throw new Error('GOOGLE_APPLICATION_CREDENTIALS not set');

  const auth = new GoogleAuth({
    keyFile: credFile,
    scopes:  ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const tokenResponse = await (client as { getAccessToken(): Promise<{ token: string }> }).getAccessToken();
  const token = tokenResponse.token;
  if (!token) throw new Error('Failed to get access token');
  console.log('Auth OK');

  // better-sqlite3 CJS/ESM interop
  const DB = (Database as unknown as { default?: typeof Database }).default ?? Database;
  const db = new DB(DB_PATH, { readonly: true });

  for (const source of ['imsbc', 'igc', 'jwc', 'bimco']) {
    const rows = db
      .prepare(`SELECT rowid, c0 as content, c1 as metadata_json FROM ${source}_fts_content`)
      .all() as FtsRow[];

    console.log(`\n${source}: ${rows.length} rows`);

    const docs = rows.map(row => buildDoc(source, row));

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = docs.slice(i, i + BATCH_SIZE);
      await importBatch(source, batch, token, Math.floor(i / BATCH_SIZE) + 1);
    }
  }

  db.close();
  console.log('\n✅ All sources imported');
}

main().catch(err => { console.error(err); process.exit(1); });
