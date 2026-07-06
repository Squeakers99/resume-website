"use client";

import { useRef, useState, useTransition } from "react";
import { finalizeProjectImagesAction, submitProjectAction } from "./actions";
import styles from "./Dashboard.module.css";

type Status = { ok: boolean; message: string } | null;

export default function ProjectUploadSection() {
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [secondaryFiles, setSecondaryFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<Status>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function addTag() {
    const tag = tagDraft.trim();
    if (tag && !tags.includes(tag)) setTags((prev) => [...prev, tag]);
    setTagDraft("");
  }

  function resetForm() {
    formRef.current?.reset();
    setTags([]);
    setTagDraft("");
    setMainFile(null);
    setSecondaryFiles([]);
  }

  async function uploadFile(url: string, file: File): Promise<boolean> {
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setStatus(null);

      const result = await submitProjectAction({
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        githubUrl: String(formData.get("githubUrl") ?? ""),
        tags,
        mainImageType: mainFile?.type,
        secondaryImageTypes: secondaryFiles.map((f) => f.type),
      });

      if (!result.ok || !result.projectId) {
        setStatus({ ok: false, message: result.message });
        return;
      }

      const failures: string[] = [];

      if (mainFile && result.mainUploadUrl) {
        const ok = await uploadFile(result.mainUploadUrl, mainFile);
        if (!ok) failures.push(mainFile.name);
      }

      const secondaryResults = await Promise.all(
        secondaryFiles.map((file, i) => {
          const url = result.secondaryUploadUrls?.[i];
          return url ? uploadFile(url, file) : Promise.resolve(false);
        })
      );
      secondaryResults.forEach((ok, i) => {
        if (!ok) failures.push(secondaryFiles[i].name);
      });

      if (mainFile || secondaryFiles.length > 0) {
        const finalized = await finalizeProjectImagesAction(
          result.projectId,
          secondaryFiles.length
        );
        if (!finalized.ok) {
          setStatus({
            ok: false,
            message: `Project created, but storing image URLs failed: ${finalized.error}`,
          });
          return;
        }
      }

      if (failures.length > 0) {
        setStatus({
          ok: false,
          message: `Project created, but these uploads failed: ${failures.join(", ")}`,
        });
        return;
      }

      setStatus({ ok: true, message: result.message });
      resetForm();
    });
  }

  return (
    <section className={styles.card} aria-label="Project upload" aria-busy={isPending}>
      <h2 className={styles.cardTitle}>project-upload</h2>
      <p className={styles.cardSubtitle}>Add new project to portfolio</p>

      <form ref={formRef} className={styles.form} action={handleSubmit}>
        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="project-name">
            Project Name
          </label>
          <input
            id="project-name"
            name="title"
            type="text"
            className={styles.input}
            placeholder="My next big thing"
            required
          />
        </div>

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="project-desc">
            Description
          </label>
          <textarea
            id="project-desc"
            name="description"
            className={styles.textarea}
            rows={3}
            placeholder="What it does and why it matters"
            required
          />
        </div>

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="main-image">
            Main Image
          </label>
          <div className={styles.fileRow}>
            <input
              id="main-image"
              type="file"
              accept="image/*"
              className={styles.fileInput}
              onChange={(e) => setMainFile(e.target.files?.[0] ?? null)}
            />
            {mainFile && (
              <button
                type="button"
                className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                aria-label="Remove main image"
                onClick={() => setMainFile(null)}
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="secondary-images">
            Secondary Images
          </label>
          {secondaryFiles.length > 0 && (
            <ul className={styles.fileList}>
              {secondaryFiles.map((file, i) => (
                <li key={`${file.name}-${i}`} className={styles.fileListItem}>
                  <span className={styles.fileName}>{file.name}</span>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                    aria-label={`Remove ${file.name}`}
                    onClick={() =>
                      setSecondaryFiles((prev) => prev.filter((_, idx) => idx !== i))
                    }
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            id="secondary-images"
            type="file"
            accept="image/*"
            multiple
            className={styles.fileInput}
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              if (picked.length) setSecondaryFiles((prev) => [...prev, ...picked]);
              e.target.value = "";
            }}
          />
        </div>

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="project-tags">
            Tags / Tech Stack
          </label>
          {tags.length > 0 && (
            <div className={styles.chipRow}>
              {tags.map((tag) => (
                <span key={tag} className={styles.chip}>
                  {tag}
                  <button
                    type="button"
                    className={styles.chipRemove}
                    aria-label={`Remove ${tag}`}
                    onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className={styles.fileRow}>
            <input
              id="project-tags"
              type="text"
              className={styles.input}
              placeholder="Type a tag, press Enter"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag();
                }
              }}
            />
            <button type="button" className={styles.btnSecondary} onClick={addTag}>
              Add Tag
            </button>
          </div>
        </div>

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="github-url">
            GitHub URL
          </label>
          <input
            id="github-url"
            name="githubUrl"
            type="url"
            className={styles.input}
            placeholder="https://github.com/..."
          />
        </div>

        {status && (
          <p
            className={status.ok ? styles.feedbackOk : styles.feedbackError}
            role="status"
          >
            {status.message}
          </p>
        )}

        <div className={styles.formActions}>
          <button type="submit" className={styles.btnPrimary} disabled={isPending}>
            {isPending ? "Publishing..." : "Submit Project"}
          </button>
        </div>
      </form>
    </section>
  );
}
