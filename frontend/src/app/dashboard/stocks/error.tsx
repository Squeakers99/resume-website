"use client";

import { DashboardErrorBody } from "../_shell/Boundaries";

// The section layout already supplies the page wrapper.
export default function SectionError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <DashboardErrorBody {...props} />;
}
