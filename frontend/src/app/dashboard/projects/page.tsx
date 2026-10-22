import { PageHeader } from "@/app/components/ui";
import ProjectUploadSection from "./ProjectUploadSection";
import styles from "../Dashboard.module.css";

export const metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <main className={styles.wrapper}>
      <PageHeader title="Projects" />
      <ProjectUploadSection />
    </main>
  );
}
