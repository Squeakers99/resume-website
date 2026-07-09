"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { FaGithub } from "react-icons/fa";
import { FiChevronLeft, FiChevronRight, FiPause, FiPlay } from "react-icons/fi";
import GhostFallback from "./GhostFallback";
import { formatAdded, pad2, parseRepoLink, type Entry } from "./projectUtils";
import { useDampedSwipe } from "./useDampedSwipe";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import styles from "./Projects.module.css";

type Props = {
  pool: Entry[];
  onOpen: (entry: Entry) => void;
};

export default function FeaturedCarousel({ pool, onOpen }: Props) {
  const count = pool.length;
  const [index, setIndex] = useState(0);
  const [cancelled, setCancelled] = useState(false);
  const [paused, setPaused] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const reduced = usePrefersReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef({ hover: false, focus: false, pointer: false });

  const markFailed = (src: string) => {
    // Bail out with the same reference when already recorded — ref callbacks
    // re-run every render, and a fresh Set each time would loop forever.
    setFailed((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));
  };

  const goTo = (next: number) => {
    setIndex(next);
    setCancelled(true);
    setAnnounce(
      `Project ${pad2(next + 1)} of ${pad2(count)}: ${pool[next].project.title}`
    );
  };

  const stepBy = (dir: 1 | -1) => goTo((index + dir + count) % count);

  const swipe = useDampedSwipe(trackRef, {
    enabled: count > 1,
    reduced,
    onCommit: stepBy,
  });

  // Guarded autoplay: never under reduced motion, permanently cancelled by
  // any manual action, skipped while hovered / focused / pressed / hidden.
  useEffect(() => {
    if (reduced || cancelled || paused || count < 2) return;
    const id = setInterval(() => {
      const paused = pausedRef.current;
      if (document.hidden || paused.hover || paused.focus || paused.pointer) {
        return;
      }
      setIndex((i) => (i + 1) % count);
    }, 6000);
    return () => clearInterval(id);
  }, [reduced, cancelled, paused, count]);

  const current = pool[index];
  const repo = parseRepoLink(current.project.githubUrl);
  const added = formatAdded(current.project.createdAt);
  const rotating = !reduced && !cancelled && !paused && count > 1;

  const handlePointerDown = (e: PointerEvent<HTMLElement>) => {
    pausedRef.current.pointer = true;
    swipe.handlers.onPointerDown(e);
  };
  const handlePointerUp = (e: PointerEvent<HTMLElement>) => {
    pausedRef.current.pointer = false;
    swipe.handlers.onPointerUp(e);
  };
  const handlePointerCancel = (e: PointerEvent<HTMLElement>) => {
    pausedRef.current.pointer = false;
    swipe.handlers.onPointerCancel(e);
  };

  return (
    <section
      className={`${styles.stage} ${styles.stageEnter}`}
      role="group"
      aria-roledescription="carousel"
      aria-label="Featured projects"
      onPointerDown={handlePointerDown}
      onPointerMove={swipe.handlers.onPointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerEnter={() => {
        pausedRef.current.hover = true;
      }}
      onPointerLeave={() => {
        pausedRef.current.hover = false;
        // A press that leaves the surface may never deliver pointerup here
        // (no capture before swipe intent) — don't let the flag stick.
        pausedRef.current.pointer = false;
      }}
      onFocus={() => {
        pausedRef.current.focus = true;
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          pausedRef.current.focus = false;
        }
      }}
      onKeyDown={(e) => {
        if (count < 2) return;
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          stepBy(-1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          stepBy(1);
        }
      }}
    >
      <div className={styles.stageTrack} ref={trackRef}>
        {pool.map((entry, i) => (
          <div
            key={entry.project.id}
            className={`${styles.slide} ${i === index ? styles.slideActive : ""}`}
            aria-hidden={i !== index}
          >
            {failed.has(entry.project.imageUrl) ? (
              <GhostFallback n={entry.n} />
            ) : (
              // The stage button carries the accessible name for the slide.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={entry.project.imageUrl}
                alt=""
                loading={i === 0 ? "eager" : undefined}
                decoding="async"
                ref={(node) => {
                  // Images settled before hydration never fire load/error.
                  if (node?.complete) {
                    if (node.naturalWidth > 0) node.dataset.loaded = "true";
                    else markFailed(entry.project.imageUrl);
                  }
                }}
                onLoad={(e) => {
                  e.currentTarget.dataset.loaded = "true";
                }}
                onError={() => markFailed(entry.project.imageUrl)}
              />
            )}
          </div>
        ))}
      </div>

      <div className={styles.scrim} aria-hidden="true" />

      <button
        type="button"
        className={styles.stageButton}
        aria-label={`View details for ${current.project.title}`}
        onClick={() => {
          if (swipe.wasDragged()) return;
          setCancelled(true);
          onOpen(current);
        }}
      />

      <div key={index} className={styles.caption} aria-hidden="true">
        <span className={styles.captionTitle}>{current.project.title}</span>
        <span className={styles.captionMeta}>
          {repo ? (
            <>
              <FaGithub />
              <span className={styles.metaText}>{repo.slug}</span>
            </>
          ) : (
            <span className={`${styles.metaText} ${styles.captionMetaMuted}`}>
              {added ?? ""}
            </span>
          )}
        </span>
      </div>

      {count > 1 && !reduced ? (
        <button
          type="button"
          className={styles.playPause}
          aria-label={
            rotating
              ? "Pause automatic slide rotation"
              : "Start automatic slide rotation"
          }
          onClick={() => {
            if (rotating) {
              setPaused(true);
            } else {
              setPaused(false);
              setCancelled(false);
            }
          }}
        >
          {rotating ? (
            <FiPause aria-hidden="true" />
          ) : (
            <FiPlay aria-hidden="true" />
          )}
        </button>
      ) : null}

      {count > 1 ? (
        <>
          <button
            type="button"
            className={`${styles.arrow} ${styles.arrowLeft}`}
            aria-label="Previous featured project"
            onClick={() => stepBy(-1)}
          >
            <FiChevronLeft aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${styles.arrow} ${styles.arrowRight}`}
            aria-label="Next featured project"
            onClick={() => stepBy(1)}
          >
            <FiChevronRight aria-hidden="true" />
          </button>

          <div className={styles.dots}>
            {pool.map((entry, i) => (
              <button
                key={entry.project.id}
                type="button"
                className={`${styles.dot} ${i === index ? styles.dotActive : ""}`}
                aria-label={`Go to project ${i + 1} of ${count}: ${entry.project.title}`}
                aria-current={i === index}
                onClick={() => goTo(i)}
              />
            ))}
          </div>

          <span className={styles.counter} aria-hidden="true">
            {pad2(index + 1)} / {pad2(count)}
          </span>
        </>
      ) : null}

      <span className={styles.srOnly} aria-live="polite">
        {announce}
      </span>
    </section>
  );
}
