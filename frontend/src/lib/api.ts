export type Project = {
  id: string;
  title: string;
  description: string;
  githubUrl: string;
  imageUrl: string;
  tags: string[];
  createdAt: string;
};

export async function getProjects(): Promise<Project[]> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");

  const res = await fetch(`${base}/api/projects`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch projects: ${res.status}`);

  return res.json();
}

export async function getBackendStatus(): Promise<"connected" | "disconnected"> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) return "disconnected";

  try {
    const res = await fetch(`${base}/health`, { cache: "no-store" });
    if (!res.ok) return "disconnected";

    const body = (await res.json()) as { ok?: boolean };
    return body.ok ? "connected" : "disconnected";
  } catch {
    return "disconnected";
  }
}
