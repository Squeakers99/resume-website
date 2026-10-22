"use client";

import { useEffect } from "react";
import { Banner, Skeleton } from "@/app/components/ui";
import styles from "../Loading.module.css";

// Bodies shared by the dashboard loading.tsx / error.tsx route files. Routes
// whose layout already provides the page wrapper (budget, stocks) render these
// bare; the top-level dashboard routes wrap them in Dashboard.module.css's wrapper.

export function DashboardLoadingBody() {
  return (
    <div className={styles.stack} aria-busy="true">
      <Skeleton height={32} width={240} />
      <Skeleton height={120} />
      <Skeleton height={120} />
      <Skeleton height={120} />
    </div>
  );
}

export function DashboardErrorBody({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div>
      <Banner tone="error">Something went wrong loading this page.</Banner>
      <button type="button" className={styles.retry} onClick={reset}>
        Try again
      </button>
    </div>
  );
}
