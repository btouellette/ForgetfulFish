import { getAuthHandlers } from "../../../../auth";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return (await getAuthHandlers()).GET(request);
}

export async function POST(request: NextRequest) {
  return (await getAuthHandlers()).POST(request);
}
