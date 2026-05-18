"use client";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div>
          <h2>Something went wrong</h2>
          <p>An unexpected error occurred.</p>
          <button onClick={reset}>Try again</button>
        </div>
      </body>
    </html>
  );
}
