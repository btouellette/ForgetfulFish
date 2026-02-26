import Link from "next/link";

import { AuthVerificationState } from "./verification-state";

export const dynamic = "force-static";

export default function AuthVerifyPage() {
  return (
    <main className="home">
      <h1>Auth Verification</h1>
      <p>This page stays static and verifies your current auth session in the browser.</p>
      <AuthVerificationState />
      <p>
        <Link href="/">Back to sign-in</Link>
      </p>
    </main>
  );
}
