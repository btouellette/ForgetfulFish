import Link from "next/link";

import { AuthEntry } from "./auth-entry";
import { getDefaultCallbackUrl, isGoogleAuthEnabled } from "../lib/auth-config";

export default function HomePage() {
  const callbackUrl = getDefaultCallbackUrl({
    googleCallback: process.env.GOOGLE_CALLBACK ?? ""
  });
  const googleEnabled = isGoogleAuthEnabled({
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? ""
  });

  return (
    <main className="home">
      <h1>Forgetful Fish</h1>
      <p>Start auth directly from this page.</p>
      <AuthEntry callbackUrl={callbackUrl} googleEnabled={googleEnabled} />
      <p>
        <Link href="/auth/verify">Open auth verification page</Link>
      </p>
    </main>
  );
}
