/** Accepts either a full invitation link (…/e/slug?token=…) or a short event code (ABCD-2345). */
export function parseInvite(input: string, currentOrigin: string): { kind: "link"; path: string } | { kind: "code"; code: string } | null {
  const value = input.trim();
  if (!value) return null;
  const looksLikeUrl = /^https?:\/\//i.test(value) || value.includes("/e/");
  if (looksLikeUrl) {
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `${currentOrigin}/${value.replace(/^\/+/, "")}`);
      const match = url.pathname.match(/^\/e\/([a-z0-9-]+)\/?$/);
      if (match && url.searchParams.get("token")) return { kind: "link", path: `/e/${match[1]}?token=${encodeURIComponent(url.searchParams.get("token")!)}` };
    } catch {
      return null;
    }
    return null;
  }
  return { kind: "code", code: value };
}
