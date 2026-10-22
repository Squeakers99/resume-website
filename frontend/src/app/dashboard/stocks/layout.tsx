import { PageHeader, Tabs } from "@/app/components/ui";
import { STOCKS_TABS } from "../_shell/nav";
import dashStyles from "../Dashboard.module.css";
import styles from "./Stocks.module.css";

export default function StocksLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={`${dashStyles.wrapper} ${styles.stocksLayout}`}>
      <PageHeader title="Stocks" />
      <Tabs items={STOCKS_TABS} ariaLabel="Stocks sections" />
      {children}
    </div>
  );
}
