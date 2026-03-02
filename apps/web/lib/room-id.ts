const roomIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractRoomIdCandidate(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsedUrl = new URL(trimmed);
      const parts = parsedUrl.pathname.split("/").filter(Boolean);

      if (parts.length >= 2 && parts[0] === "play") {
        return parts[1] ?? "";
      }

      return "";
    } catch {
      return "";
    }
  }

  return trimmed;
}

export function parseRoomIdInput(input: string) {
  const roomIdCandidate = extractRoomIdCandidate(input);

  if (!roomIdCandidate) {
    return "";
  }

  return roomIdPattern.test(roomIdCandidate) ? roomIdCandidate : "";
}
