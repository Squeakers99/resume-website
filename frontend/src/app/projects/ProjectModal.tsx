"use client";

import { useEffect, useRef, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { FiChevronLeft, FiChevronRight, FiX } from "react-icons/fi";
import GhostFallback from "./GhostFallback";
import {
  formatAdded,
  galleryImages,
  pad2,
  parseRepoLink,
  type Entry,
} from "./projectUtils";
import { useDampedSwipe } from "./useDampedSwipe";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import styles from "./Projects.module.css";

type Props = {
  entry: Entry | null;
  onClose: () => void;
};

export default function ProjectModal({ entry, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const backdropPressRef = useRef(false);
  const [closing, setClosing] = useState(false);
  const [index, setIndex] = useState(0);
  const [announce, setAnnounce] = useState("");
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const reduced = usePrefersReducedMotion();

  // Reset per-project state the moment a different project comes in
  // (state-from-props adjustment during render, not an effect).
  const [prevId, setPrevId] = useState<string | null>(null);
  const projectId = entry?.project.id ?? null;
  if (projectId !== prevId) {
    setPrevId(projectId);
    setIndex(0);
    setAnnounce("");
    setFailed(new Set());
    setClosing(false);
  }

  const project = entry?.project ?? null;
  const images = project ? galleryImages(project) : [];
  const count = images.length;

  // Keep the always-mounted <dialog> in sync with the selected project.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (entry && !dialog.open) {
      dialog.showModal();
      titleRef.current?.focus();
    } else if (!entry && dialog.open) {
      dialog.close();
    }
  }, [entry]);

  // Lock page scroll behind the top layer while open.
  useEffect(() => {
    if (!entry) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [entry]);

  const finishClose = () => {
    if (!entry) return;
    setClosing(false);
    onClose();
  };

  const requestClose = () => {
    if (!entry || closing) return;
    setClosing(true);
  };

  // Fallback in case animationend never fires (e.g. animations disabled).
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(finishClose, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  const markFailed = (src: string) => {
    setFailed((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));
  };

  const goTo = (next: number) => {
    setIndex(next);
    setAnnounce(`Image ${next + 1} of ${count}`);
  };

  const stepBy = (dir: 1 | -1) => {
    if (count < 2) return;
    goTo((index + dir + count) % count);
  };

  const swipe = useDampedSwipe(galleryRef, {
    enabled: count > 1,
    reduced,
    onCommit: stepBy,
  });

  // Keep the active thumbnail in view.
  useEffect(() => {
    thumbRefs.current[index]?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
      behavior: reduced ? "auto" : "smooth",
    });
  }, [index, reduced]);

  const repo = project ? parseRepoLink(project.githubUrl) : null;
  const added = project ? formatAdded(project.createdAt) : null;
  const tags = project?.tags ?? [];

  return (
    <dialog
      ref={dialogRef}
      className={styles.modal}
      aria-labelledby={project ? "project-modal-title" : undefined}
      data-closing={closing ? "true" : undefined}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onPointerDown={(e) => {
        // Only a press that STARTS on the backdrop may close on click —
        // otherwise a text-selection drag ending past the card dismisses it.
        backdropPressRef.current = e.target === dialogRef.current;
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current && backdropPressRef.current) {
          requestClose();
        }
      }}
      onAnimationEnd={(e) => {
        if (closing && e.target === dialogRef.current) finishClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          stepBy(-1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          stepBy(1);
        }
      }}
    >
      {project && entry ? (
        <div className={styles.modalInner}>
          <button
            type="button"
            className={styles.closeBtn}
            aria-label="Close project details"
            onClick={requestClose}
          >
            <FiX aria-hidden="true" />
          </button>

          <div className={styles.detailCol}>
            <h2
              id="project-modal-title"
              ref={titleRef}
              tabIndex={-1}
              className={styles.modalTitle}
            >
              {project.title}
            </h2>

            {repo ? (
              <a
                className={styles.slugLink}
                href={repo.href}
                target="_blank"
                rel="noreferrer"
              >
                <FaGithub aria-hidden="true" />
                <span className={styles.metaText}>{repo.slug}</span>
              </a>
            ) : (
              <span className={styles.noRepo}>no public repo</span>
            )}

            {project.description ? (
              <p className={styles.modalDesc}>{project.description}</p>
            ) : null}

            <hr className={styles.divider} />

            {tags.length > 0 ? (
              <>
                <p className={styles.builtEyebrow}>Built with</p>
                <ul className={styles.chips}>
                  {tags.map((tag, i) => (
                    <li key={`${tag}-${i}`} className={styles.chip}>
                      {tag}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {added ? <p className={styles.dateStamp}>{added}</p> : null}

            {repo ? (
              <a
                className={styles.cta}
                href={repo.href}
                target="_blank"
                rel="noreferrer"
              >
                View GitHub repo <span aria-hidden="true">→</span>
              </a>
            ) : null}
          </div>

          <div className={styles.galleryCol}>
            <div
              className={styles.galleryMain}
              onPointerDown={swipe.handlers.onPointerDown}
              onPointerMove={swipe.handlers.onPointerMove}
              onPointerUp={swipe.handlers.onPointerUp}
              onPointerCancel={swipe.handlers.onPointerCancel}
            >
              <div className={styles.galleryTrack} ref={galleryRef}>
              {count === 0 ? (
                <GhostFallback n={entry.n} />
              ) : (
                images.map((src, i) => (
                  <div
                    key={src}
                    className={`${styles.gallerySlide} ${
                      i === index ? styles.gallerySlideActive : ""
                    }`}
                    aria-hidden={i !== index}
                  >
                    {failed.has(src) ? (
                      <GhostFallback n={entry.n} />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={src}
                        alt={`${project.title} — image ${i + 1} of ${count}`}
                        decoding="async"
                        ref={(node) => {
                          if (node?.complete) {
                            if (node.naturalWidth > 0) {
                              node.dataset.loaded = "true";
                            } else {
                              markFailed(src);
                            }
                          }
                        }}
                        onLoad={(e) => {
                          e.currentTarget.dataset.loaded = "true";
                        }}
                        onError={() => markFailed(src)}
                      />
                    )}
                  </div>
                ))
              )}
              </div>

              {count > 1 ? (
                <>
                  <span className={styles.galleryCounter}>
                    {pad2(index + 1)} / {pad2(count)}
                  </span>
                  <button
                    type="button"
                    className={`${styles.arrow} ${styles.galleryArrow} ${styles.arrowLeft}`}
                    aria-label="Previous image"
                    onClick={() => stepBy(-1)}
                  >
                    <FiChevronLeft aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={`${styles.arrow} ${styles.galleryArrow} ${styles.arrowRight}`}
                    aria-label="Next image"
                    onClick={() => stepBy(1)}
                  >
                    <FiChevronRight aria-hidden="true" />
                  </button>
                </>
              ) : null}
            </div>

            {count > 1 ? (
              <div className={styles.galleryControls}>
                {/* Thumbnails are the interactive nav; the dots are a purely
                    visual position readout here, redundant for AT. */}
                <div className={styles.galleryDots} aria-hidden="true">
                  {images.map((src, i) => (
                    <button
                      key={src}
                      type="button"
                      tabIndex={-1}
                      className={`${styles.dot} ${i === index ? styles.dotActive : ""}`}
                      onClick={() => goTo(i)}
                    />
                  ))}
                </div>
                <div className={styles.thumbs}>
                  {images.map((src, i) => (
                    <button
                      key={src}
                      type="button"
                      ref={(node) => {
                        thumbRefs.current[i] = node;
                      }}
                      className={`${styles.thumb} ${i === index ? styles.thumbActive : ""}`}
                      aria-label={`Show image ${i + 1} of ${count}`}
                      aria-current={i === index}
                      onClick={() => goTo(i)}
                    >
                      {failed.has(src) ? (
                        <GhostFallback n={entry.n} />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={src}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          onError={() => markFailed(src)}
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <span className={styles.srOnly} aria-live="polite">
              {announce}
            </span>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
