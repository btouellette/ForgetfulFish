import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getCanonicalRedirectUrl } from "./lib/canonical-host";

export function proxy(request: NextRequest) {
  const canonicalInput = {
    url: request.nextUrl,
    hostHeader: request.headers.get("host")
  };
  const redirectUrl = getCanonicalRedirectUrl(
    process.env.AUTH_URL
      ? {
          ...canonicalInput,
          canonicalOrigin: process.env.AUTH_URL
        }
      : canonicalInput
  );

  if (!redirectUrl) {
    return NextResponse.next();
  }

  return NextResponse.redirect(redirectUrl, 301);
}
