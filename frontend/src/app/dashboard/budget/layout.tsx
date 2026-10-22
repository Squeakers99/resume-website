import Link from "next/link";
import { Banner, PageHeader, Tabs } from "@/app/components/ui";
import { BUDGET_TABS } from "@/app/dashboard/_shell/nav";
import { getBackendConnected, getBudgetStatementsCached } from "@/lib/dashboard-cache";
import dashStyles from "../Dashboard.module.css";

export default async function BudgetLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const backendConnected = await getBackendConnected();
  // Shared with the Statements page through the per-request cache.
  const statements = backendConnected ? await getBudgetStatementsCached() : [];
  const hasMismatch = statements.some((s) => s.validationStatus === "mismatch");

  return (
    <div className={dashStyles.wrapper}>
      <PageHeader title="Budget" />
      <Tabs items={BUDGET_TABS} ariaLabel="Budget sections" />

      {hasMismatch && (
        <Banner tone="warning">
          Some statements failed totals validation - review or delete them on the{" "}
          <Link href="/dashboard/budget/statements">Statements tab</Link>.
        </Banner>
      )}

      {children}
    </div>
  );
}
