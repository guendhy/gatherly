export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** Slug with a short random suffix so event URLs are not trivially guessable. */
export function eventSlug(name: string, random: () => string): string {
  const base = slugify(name) || "event";
  return `${base.length < 3 ? `${base}-event` : base}-${random()}`;
}
