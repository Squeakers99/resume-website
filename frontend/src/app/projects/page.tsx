import type { Metadata } from "next";
import { getProjects, type Project } from "@/lib/api";
import ProjectsGallery from "./ProjectsGallery";
import { pad2 } from "./projectUtils";
import styles from "./Projects.module.css";

export const metadata: Metadata = {
  title: "Projects",
};

export default async function ProjectsPage() {
  let projects: Project[] | null = null;
  try {
    projects = await getProjects();
  } catch {
    projects = null;
  }

  const count = projects?.length ?? 0;
  const eyebrow =
    projects === null
      ? "Project log — offline"
      : `Project log — ${pad2(count)} entries`;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 className={styles.title}>Projects</h1>
        </header>

        {projects === null ? (
          <section className={styles.statusPanel} aria-label="Projects status">
            <span
              className={`${styles.statusDot} ${styles.statusDotOffline}`}
              aria-hidden="true"
            />
            <p>
              Projects are unavailable right now — the API isn&apos;t
              responding. Try again in a minute.
            </p>
          </section>
        ) : count === 0 ? (
          <section className={styles.statusPanel} aria-label="Projects status">
            <span
              className={`${styles.statusDot} ${styles.statusDotOnline}`}
              aria-hidden="true"
            />
            <p>
              No projects yet — they appear here once published from the
              dashboard.
            </p>
          </section>
        ) : (
          <ProjectsGallery projects={projects} />
        )}
      </div>
    </main>
  );
}
