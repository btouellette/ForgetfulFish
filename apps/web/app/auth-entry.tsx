"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

type AuthEntryProps = {
  callbackUrl: string;
  googleEnabled: boolean;
};

export function AuthEntry({ callbackUrl, googleEnabled }: AuthEntryProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleEmailSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setStatus("sending");
    setErrorMessage("");

    const result = await signIn("email", {
      email,
      callbackUrl,
      redirect: false
    });

    if (result?.error) {
      setStatus("error");
      setErrorMessage(result.error);
      return;
    }

    setStatus("sent");
  }

  return (
    <section>
      <h2>Email magic link</h2>
      <form onSubmit={handleEmailSignIn}>
        <label htmlFor="auth-email">Email</label>
        <input
          id="auth-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />
        <button type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending..." : "Email me a magic link"}
        </button>
      </form>
      {status === "sent" ? <p>Magic link requested. Check your inbox.</p> : null}
      {status === "error" ? <p>Unable to send magic link: {errorMessage}</p> : null}

      {googleEnabled ? (
        <>
          <h2>Google OAuth</h2>
          <button type="button" onClick={() => signIn("google", { callbackUrl })}>
            Continue with Google
          </button>
        </>
      ) : (
        <p>Google OAuth is disabled. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable it.</p>
      )}
    </section>
  );
}
