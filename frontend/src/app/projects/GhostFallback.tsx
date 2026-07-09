import { FiImage } from "react-icons/fi";
import { pad2 } from "./projectUtils";
import styles from "./Projects.module.css";

// Designed stand-in for a missing or failed project image: the project's
// zero-padded log index as a ghost numeral on a chip-to-card gradient.
export default function GhostFallback({ n }: { n: number }) {
  return (
    <div className={styles.ghost} aria-hidden="true">
      <FiImage className={styles.ghostIcon} />
      <span className={styles.ghostNum}>{pad2(n)}</span>
    </div>
  );
}
