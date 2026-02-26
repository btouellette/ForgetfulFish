import { getAuthHandlers } from "../../../../auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@forgetful-fish/database";

import { getRateLimitRedirectUrl } from "../../../../lib/magic-link-throttle";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return (await getAuthHandlers()).GET(request);
}

export async function POST(request: NextRequest) {
  const redirectUrl = await getRateLimitRedirectUrl({
    request,
    pathname: request.nextUrl.pathname,
    store: prisma
  });
  if (redirectUrl) {
    return NextResponse.redirect(redirectUrl, 302);
  }

  return (await getAuthHandlers()).POST(request);
}
