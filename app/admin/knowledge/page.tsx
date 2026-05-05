import { getStore } from '@/lib/session-store';
import { listSources } from '@/lib/knowledge/governance';
import { SourceTable } from './_components/SourceTable';

export default async function KnowledgePage() {
  const db = getStore().getDb();
  const sources = listSources(db);

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-gray-900">
          Knowledge Layer — статус источников
        </h1>
        <SourceTable sources={sources} />
      </div>
    </main>
  );
}
