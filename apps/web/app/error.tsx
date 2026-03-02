"use client";

import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="home">
      <h1>Something went wrong.</h1>
      <p>We hit an unexpected error while loading this page.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
