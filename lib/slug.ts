export const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "Dashboard Kaloní — Q3 2026" → "dashboard-kaloni-q3-2026" */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function isValidSlug(slug: string): boolean {
  return slug.length >= 2 && slug.length <= 80 && SLUG_REGEX.test(slug);
}
