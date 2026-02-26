type CanonicalHostInput = {
  url: URL;
  hostHeader: string | null;
  canonicalOrigin?: string;
};

function parseCanonicalOrigin(canonicalOrigin?: string) {
  if (!canonicalOrigin) {
    return null;
  }

  try {
    return new URL(canonicalOrigin);
  } catch {
    return null;
  }
}

export function getCanonicalRedirectUrl({ url, hostHeader, canonicalOrigin }: CanonicalHostInput) {
  if (!hostHeader) {
    return null;
  }

  const hostname = hostHeader.split(":")[0]?.toLowerCase();
  if (!hostname) {
    return null;
  }

  const canonicalUrl = parseCanonicalOrigin(canonicalOrigin);
  const canonicalHostname = canonicalUrl?.hostname ?? hostname.replace(/^www\./, "");

  if (!hostname.startsWith("www.")) {
    return null;
  }

  if (!canonicalHostname || hostname === canonicalHostname) {
    return null;
  }

  const redirectUrl = new URL(url.toString());
  redirectUrl.protocol = canonicalUrl?.protocol ?? "https:";
  redirectUrl.hostname = canonicalHostname;
  redirectUrl.port = canonicalUrl?.port ?? "";

  return redirectUrl;
}
