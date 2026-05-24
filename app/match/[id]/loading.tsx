export default function Loading() {
  return (
    <main className="min-h-screen bg-ds-bg">
      {/* Hero skeleton */}
      <div className="bg-ds-accent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 pb-6 animate-pulse">
          <div className="h-4 w-20 bg-slate-700 rounded mb-4" />
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-full bg-slate-700 shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-6 w-48 bg-slate-700 rounded" />
              <div className="h-4 w-36 bg-slate-700 rounded" />
              <div className="h-3 w-28 bg-slate-600 rounded" />
            </div>
          </div>
        </div>
      </div>

      {/* Body skeleton */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 animate-pulse">
        <div className="flex gap-6 items-start">
          {/* Left main content */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Vessel + Cargo cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-4 ring-1 ring-gray-200 space-y-3">
                <div className="h-3 w-16 bg-gray-200 rounded" />
                <div className="space-y-2">
                  <div className="h-4 w-full bg-gray-200 rounded" />
                  <div className="h-4 w-3/4 bg-gray-200 rounded" />
                  <div className="h-4 w-1/2 bg-gray-200 rounded" />
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 ring-1 ring-gray-200 space-y-3">
                <div className="h-3 w-16 bg-gray-200 rounded" />
                <div className="space-y-2">
                  <div className="h-4 w-full bg-gray-200 rounded" />
                  <div className="h-4 w-3/4 bg-gray-200 rounded" />
                  <div className="h-4 w-2/3 bg-gray-200 rounded" />
                </div>
              </div>
            </div>
            {/* Tabs skeleton */}
            <div className="bg-white rounded-xl ring-1 ring-gray-200 p-4 space-y-3">
              <div className="flex gap-4 border-b pb-2">
                <div className="h-5 w-14 bg-gray-200 rounded" />
                <div className="h-5 w-20 bg-gray-200 rounded" />
                <div className="h-5 w-16 bg-gray-200 rounded" />
                <div className="h-5 w-12 bg-gray-200 rounded" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-full bg-gray-200 rounded" />
                <div className="h-4 w-5/6 bg-gray-200 rounded" />
                <div className="h-4 w-4/5 bg-gray-200 rounded" />
              </div>
            </div>
          </div>

          {/* Right panel skeleton (desktop) */}
          <div className="hidden lg:block w-72 shrink-0 space-y-3">
            <div className="bg-white rounded-xl ring-1 ring-gray-200 p-4 space-y-2">
              <div className="h-3 w-20 bg-gray-200 rounded" />
              <div className="h-12 bg-gray-100 rounded" />
            </div>
            <div className="bg-white rounded-xl ring-1 ring-gray-200 p-4 space-y-2">
              <div className="h-3 w-24 bg-gray-200 rounded" />
              <div className="h-8 bg-gray-100 rounded" />
              <div className="h-8 bg-gray-100 rounded" />
              <div className="h-8 bg-gray-100 rounded" />
            </div>
            <div className="bg-white rounded-xl ring-1 ring-gray-200 p-4 space-y-2">
              <div className="h-3 w-16 bg-gray-200 rounded" />
              <div className="h-16 bg-gray-100 rounded" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
