import { getProjects } from "@/lib/api";

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Projects</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        {projects.map((p) => (
          <div
            key={p.id}
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 16,
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{p.title}</div>
            <div style={{ opacity: 0.8, marginBottom: 12 }}>{p.description}</div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {p.tags?.map((t) => (
                <span
                  key={t}
                  style={{
                    fontSize: 12,
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.16)",
                    opacity: 0.9,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>

            {p.githubUrl ? (
              <a href={p.githubUrl} target="_blank" rel="noreferrer">
                GitHub →
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </main>
  );
}