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
  row_id: number;   // id column aliased to row_id (avoids shadow-table rowid quirks)
  content: string;
  metadata_json: string;
}

function cleanObj(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
}

interface VertexDoc {
  id: string;
  structData: Record<string, unknown>;
  content: { mimeType: string; rawBytes: string }; // base64-encoded
}

function buildDoc(source: string, row: FtsRow): VertexDoc {
  const meta: Record<string, unknown> = JSON.parse(row.metadata_json || '{}');
  const rawText = row.content;

  if (source === 'jwc') {
    return {
      id: `jwc-${row.row_id}`,
      structData: cleanObj({
        source:         'jwc',
        id:             (meta.bulletin_ref as string) || `jwc-${row.row_id}`,
        bulletinId:     (meta.bulletin_ref as string) || `jwc-${row.row_id}`,
        zone_id:        meta.zone_id,
        region:         meta.region,
        effective_from: meta.effective_from,
        confidence:     meta.confidence,
        title:          row.content.split('\n')[0]?.trim() || `JWC Zone ${row.row_id}`,
      }),
      content: { mimeType: 'text/plain', rawBytes: Buffer.from(rawText).toString('base64') },
    };
  }

  if (source === 'bimco') {
    return {
      id: `bimco-${row.row_id}`,
      structData: cleanObj({
        source:       'bimco',
        id:           (meta.id as string) || `bimco-${row.row_id}`,
        section:      meta.clauseNumber ? String(meta.clauseNumber) : undefined,
        sourceUrl:    meta.sourceUrl,
        title:        meta.title,
        charterParty: meta.charterParty,
      }),
      content: { mimeType: 'text/plain', rawBytes: Buffer.from(rawText).toString('base64') },
    };
  }

  // imsbc, igc
  return {
    id: `${source}-${row.row_id}`,
    structData: cleanObj({
      source:    (meta.source as string) || source,
      section:   meta.section,
      id:        `${source}-${row.row_id}`,
      sourceUrl: meta.sourceUrl,
      title:     meta.title,
    }),
    content: { mimeType: 'text/plain', rawBytes: Buffer.from(rawText).toString('base64') },
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
      console.log(`  done — success: ${meta?.successCount ?? '?'}  failed: ${meta?.failureCount ?? 0}`);
      const resp = op.response as Record<string, unknown> | undefined;
      if (resp?.errorSamples) console.log('  errors:', JSON.stringify(resp.errorSamples));
      return;
    }
    process.stdout.write('.');
  }
  console.log('  (timed out — check GCP console)');
}

async function importBatch(
  source: string,
  docs: VertexDoc[],
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
    throw new Error(`Import failed for ${source} batch ${batchNum}: ${res.status} ${text.slice(0, 300)}`);
  }

  const op = await res.json() as Record<string, unknown>;
  process.stdout.write(`  batch ${batchNum} (${docs.length} docs) → ${op.name as string} `);
  if (op.done) {
    const meta = op.metadata as Record<string, unknown> | undefined;
    console.log(`(done immediately — success: ${meta?.successCount ?? '?'} failed: ${meta?.failureCount ?? 0})`);
    const resp = op.response as Record<string, unknown> | undefined;
    if (resp?.errorSamples) console.log('  errors:', JSON.stringify(resp.errorSamples));
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

  const DB = (Database as unknown as { default?: typeof Database }).default ?? Database;
  const db = new DB(DB_PATH, { readonly: true });

  for (const source of ['imsbc', 'igc', 'jwc', 'bimco']) {
    // Use 'id' column (INTEGER PRIMARY KEY = rowid) aliased to row_id to avoid FTS5 shadow table quirks
    const rows = db
      .prepare(`SELECT id as row_id, c0 as content, c1 as metadata_json FROM ${source}_fts_content`)
      .all() as FtsRow[];

    console.log(`\n${source}: ${rows.length} rows`);

    const docs = rows.map(row => buildDoc(source, row));
    // Quick sanity check
    const undefinedIds = docs.filter(d => d.id.includes('undefined'));
    if (undefinedIds.length) console.warn(`  WARNING: ${undefinedIds.length} docs with undefined IDs`);

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = docs.slice(i, i + BATCH_SIZE);
      await importBatch(source, batch, token, Math.floor(i / BATCH_SIZE) + 1);
    }
  }

  db.close();
  console.log('\n✅ Done');
}

main().catch(err => { console.error(err); process.exit(1); });
