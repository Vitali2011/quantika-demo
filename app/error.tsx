"use client";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
