export default function PageSkeleton() {
  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-gray-200 rounded-lg" />
        <div className="space-y-3">
          <div className="h-4 w-3/4 bg-gray-200 rounded" />
          <div className="h-4 w-1/2 bg-gray-200 rounded" />
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="grid grid-cols-4 gap-3">
            <div className="h-3 bg-gray-200 rounded col-span-2" />
            <div className="h-3 bg-gray-200 rounded" />
            <div className="h-3 bg-gray-200 rounded" />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="h-3 bg-gray-100 rounded col-span-2" />
            <div className="h-3 bg-gray-100 rounded" />
            <div className="h-3 bg-gray-100 rounded" />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="h-3 bg-gray-100 rounded col-span-2" />
            <div className="h-3 bg-gray-100 rounded" />
            <div className="h-3 bg-gray-100 rounded" />
          </div>
        </div>
      </div>
    </main>
  );
}
