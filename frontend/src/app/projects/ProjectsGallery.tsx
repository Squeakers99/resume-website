"use client";

import { useMemo, useState } from "react";
import type { Project } from "@/lib/api";
import FeaturedCarousel from "./FeaturedCarousel";
import ProjectCard from "./ProjectCard";
import ProjectModal from "./ProjectModal";
import type { Entry } from "./projectUtils";
import styles from "./Projects.module.css";

export default function ProjectsGallery({ projects }: { projects: Project[] }) {
  // n is the project's 1-based position in the log — it drives the ghost
  // numerals, so it stays stable regardless of carousel ordering.
  const entries = useMemo<Entry[]>(
    () => projects.map((project, i) => ({ project, n: i + 1 })),
    [projects]
  );

  const pool = useMemo(
    () =>
      entries
        .filter((e) => e.project.imageUrl)
        .sort(
          (a, b) =>
            new Date(b.project.createdAt).getTime() -
            new Date(a.project.createdAt).getTime()
        )
        .slice(0, 5),
    [entries]
  );

  const [selected, setSelected] = useState<Entry | null>(null);

  return (
    <>
      {pool.length > 0 ? (
        <FeaturedCarousel pool={pool} onOpen={setSelected} />
      ) : null}

      <div className={styles.grid}>
        {entries.map((entry, i) => (
          <ProjectCard
            key={entry.project.id}
            entry={entry}
            enterIndex={i + 1}
            onOpen={setSelected}
          />
        ))}
      </div>

      <ProjectModal entry={selected} onClose={() => setSelected(null)} />
    </>
  );
}
