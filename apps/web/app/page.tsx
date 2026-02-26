import Link from "next/link";

import { getDefaultCallbackUrl } from "../lib/auth-config";

export default function HomePage() {
  const callbackUrl = encodeURIComponent(
    getDefaultCallbackUrl({
      googleCallback: process.env.GOOGLE_CALLBACK ?? ""
    })
  );

  return (
    <main className="home">
      <h1>Forgetful Fish</h1>
      <p>Use auth providers below. Successful sign-in redirects to static auth verification.</p>
      <p>
        <a href={`/api/auth/signin?callbackUrl=${callbackUrl}`}>Open sign-in</a>
      </p>
      <p>
        <Link href="/auth/verify">Open auth verification page</Link>
      </p>
    </main>
  );
}
