import type { Project } from "@/lib/api";

export type Entry = { project: Project; n: number };

export type RepoLink = { slug: string; href: string };

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// "https://github.com/owner/repo" -> { slug: "/owner/repo", href } with the
// href normalized to the parsed URL. Only http(s) links qualify — anything
// else is treated as "no public repo" so a dangerous or broken value never
// reaches an anchor.
export function parseRepoLink(githubUrl: string): RepoLink | null {
  if (!githubUrl) return null;
  let url: URL;
  try {
    url = new URL(githubUrl);
  } catch {
    try {
      url = new URL(`https://${githubUrl}`);
    } catch {
      return null;
    }
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length >= 2) return { slug: `/${parts[0]}/${parts[1]}`, href: url.href };
  if (parts.length === 1) return { slug: `/${parts[0]}`, href: url.href };
  return null;
}

export function formatAdded(createdAt: string): string | null {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  // Local date parts, not toISOString(): UTC would show yesterday's date for
  // evening entries in western timezones.
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `added ${y}-${m}-${d}`;
}

export function galleryImages(project: Project): string[] {
  // De-duplicated: slides, dots, and thumbnails key by src.
  return [
    ...new Set(
      [project.imageUrl, ...(project.secondaryImages ?? [])].filter(Boolean)
    ),
  ];
}
