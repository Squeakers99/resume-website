"use client";

import { useState, type CSSProperties } from "react";
import { FaGithub } from "react-icons/fa";
import GhostFallback from "./GhostFallback";
import { formatAdded, parseRepoLink, type Entry } from "./projectUtils";
import styles from "./Projects.module.css";

type Props = {
  entry: Entry;
  enterIndex: number;
  onOpen: (entry: Entry) => void;
};

export default function ProjectCard({ entry, enterIndex, onOpen }: Props) {
  const { project, n } = entry;
  const [failed, setFailed] = useState(false);
  const repo = parseRepoLink(project.githubUrl);
  const added = formatAdded(project.createdAt);
  const tags = project.tags ?? [];
  const shownTags = tags.slice(0, 4);
  const extraTags = tags.length - shownTags.length;

  return (
    <article
      className={`${styles.card} ${styles.cardEnter}`}
      style={{ "--enter-i": Math.min(enterIndex, 8) } as CSSProperties}
    >
      <div className={styles.cardImage} aria-hidden="true">
        {project.imageUrl && !failed ? (
          // The card announces itself through its title; the screenshot is
          // decorative here, so alt stays empty.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            ref={(node) => {
              // Images cached before hydration never fire onLoad/onError.
              if (node?.complete) {
                if (node.naturalWidth > 0) node.dataset.loaded = "true";
                else setFailed(true);
              }
            }}
            onLoad={(e) => {
              e.currentTarget.dataset.loaded = "true";
            }}
            onError={() => setFailed(true)}
          />
        ) : (
          <GhostFallback n={n} />
        )}
      </div>

      <div className={styles.cardBody}>
        <h2 className={styles.cardTitle}>{project.title}</h2>

        <p className={styles.metaRow}>
          {repo ? (
            <>
              <FaGithub aria-hidden="true" />
              <span className={styles.metaText}>{repo.slug}</span>
            </>
          ) : (
            <span className={`${styles.metaText} ${styles.metaMuted}`}>
              {added ?? "—"}
            </span>
          )}
        </p>

        {project.description ? (
          <p className={styles.cardDesc}>{project.description}</p>
        ) : null}

        {shownTags.length > 0 ? (
          <ul className={styles.chips}>
            {shownTags.map((tag, i) => (
              <li key={`${tag}-${i}`} className={styles.chip}>
                {tag}
              </li>
            ))}
            {extraTags > 0 ? <li className={styles.chip}>+{extraTags}</li> : null}
          </ul>
        ) : null}

        <button
          type="button"
          className={styles.cardAction}
          onClick={() => onOpen(entry)}
          aria-label={`View details for ${project.title}`}
        >
          View details
          <span className={styles.cardArrow} aria-hidden="true">
            →
          </span>
        </button>
      </div>
    </article>
  );
}
