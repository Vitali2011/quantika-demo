export default function Loading() {
  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6 animate-pulse">
        <div className="h-4 w-32 bg-gray-200 rounded" />
        <div className="space-y-2">
          <div className="h-6 w-24 bg-gray-200 rounded" />
          <div className="h-6 w-3/4 bg-gray-200 rounded" />
          <div className="h-4 w-1/2 bg-gray-200 rounded" />
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-3">
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="h-4 w-full bg-gray-200 rounded" />
          <div className="h-4 w-5/6 bg-gray-200 rounded" />
        </div>
      </div>
    </main>
  );
}
