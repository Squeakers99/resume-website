"use client";

import styles from "./Dashboard.module.css";

export default function ProjectUploadSection() {
  return (
    <section className={styles.card} aria-label="Project upload">
      <h2 className={styles.cardTitle}>project-upload</h2>
      <p className={styles.cardSubtitle}>Add new project to portfolio</p>

      <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="project-name">
            Project Name
          </label>
          <input
            id="project-name"
            type="text"
            className={styles.input}
            defaultValue="Type Here...."
            readOnly
            aria-readonly
          />
        </div>

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="project-desc">
            Description
          </label>
          <textarea
            id="project-desc"
            className={styles.textarea}
            rows={3}
            defaultValue="Type Here..."
            readOnly
            aria-readonly
          />
        </div>

        <div className={styles.formRow}>
          <span className={styles.label}>Main Image Upload</span>
          <div className={styles.fileRow}>
            <button type="button" className={styles.btnSecondary}>
              Choose Image
            </button>
            <span className={styles.fileName}>ai_cover.jpg</span>
          </div>
        </div>

        <div className={styles.formRow}>
          <span className={styles.label}>Secondary Images</span>
          <div className={styles.thumbRow}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={styles.thumb} aria-hidden="true" />
            ))}
            <button type="button" className={styles.btnAdd}>Add Images</button>
          </div>
        </div>

        <div className={styles.formRow}>
          <span className={styles.label}>Tech Stack</span>
          <div className={styles.chipRow}>
            {["React", "Next.js", "TensorFlow", "Python"].map((t) => (
              <span key={t} className={styles.chip}>{t}</span>
            ))}
          </div>
        </div>

        <div className={styles.formRow}>
          <span className={styles.label}>Tags</span>
          <div className={styles.chipRow}>
            {["AI", "ML", "2024", "Web App"].map((t) => (
              <span key={t} className={styles.chip}>{t}</span>
            ))}
          </div>
        </div>

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="github-url">
            GitHub URL
          </label>
          <input
            id="github-url"
            type="url"
            className={styles.input}
            defaultValue="https://github.com/soheilraj/ai-innovate"
            readOnly
            aria-readonly
          />
        </div>

        <div className={styles.formRowDouble}>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="project-date">
              Date
            </label>
            <input
              id="project-date"
              type="text"
              className={styles.input}
              defaultValue="12 Nov 2024"
              readOnly
              aria-readonly
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="project-status">
              Status
            </label>
            <select id="project-status" className={styles.select} defaultValue="Active" aria-readonly>
              <option value="Active">Active</option>
              <option value="Completed">Completed</option>
              <option value="Archived">Archived</option>
            </select>
          </div>
        </div>

        <div className={styles.formActions}>
          <button type="button" className={styles.btnSecondary}>Save Draft</button>
          <button type="submit" className={styles.btnPrimary}>Submit Project</button>
        </div>
      </form>
    </section>
  );
}
