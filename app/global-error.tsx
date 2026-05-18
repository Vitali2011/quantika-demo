"use client";
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html><body>
      <button onClick={reset}>Try again</button>
    </body></html>
  );
}
