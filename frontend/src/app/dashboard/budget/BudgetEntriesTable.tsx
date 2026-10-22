"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, DataTable, type DataTableColumn } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";
import type { BudgetAccountType, BudgetEntry, BudgetStatement } from "@/lib/server-api";
import { BUDGET_CATEGORIES } from "./budgetCategories";
import { formatDay } from "@/lib/formatDate";
import { recategorizeEntryAction, updateEntryAction } from "./actions";
import RecurringModal from "./RecurringModal";
import styles from "./Budgeting.module.css";

type Props = {
  entries: BudgetEntry[];
  /** Used only to label each entry's account; entries render without it. */
  statements?: BudgetStatement[];
};

const ACCOUNT_LABELS: Record<BudgetAccountType, string> = {
  credit_card: "Credit card",
  chequing: "Chequing",
  savings: "Savings",
};

type Filters = {
  search: string; // case-insensitive description match
  category: string; // "All" or a category name
  from: string; // ISO yyyy-mm-dd or ""
  to: string;
  min: string; // dollars or ""
  max: string;
};

const NO_FILTERS: Filters = {
  search: "",
  category: "All",
  from: "",
  to: "",
  min: "",
  max: "",
};
const PAGE_SIZE = 15;

export default function BudgetEntriesTable({ entries, statements }: Props) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [panelOpen, setPanelOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const set = (patch: Partial<Filters>) => {
    setPage(0); // filters change what's visible — restart from the first page
    setFilters((f) => ({ ...f, ...patch }));
  };

  const activeCount = [
    filters.search.trim() !== "",
    filters.category !== "All",
    filters.from !== "",
    filters.to !== "",
    filters.min !== "",
    filters.max !== "",
  ].filter(Boolean).length;

  // Click-to-edit descriptions. Local overrides keep the new name visible
  // until the server refresh delivers the updated row.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({});

  const displayName = (e: BudgetEntry) => nameOverrides[e.id] ?? e.description;

  const statementsById = useMemo(
    () => new Map((statements ?? []).map((s) => [s.id, s])),
    [statements]
  );
  const accountLabel = (e: BudgetEntry) => {
    const s = statementsById.get(e.statementId);
    return s ? ACCOUNT_LABELS[s.accountType] ?? s.source : "—";
  };

  const visible = useMemo(() => {
    const min = filters.min === "" ? null : Number(filters.min);
    const max = filters.max === "" ? null : Number(filters.max);
    const search = filters.search.trim().toLowerCase();
    return entries.filter((e) => {
      if (search) {
        const name = (nameOverrides[e.id] ?? e.description).toLowerCase();
        if (!name.includes(search)) return false;
      }
      if (filters.category !== "All" && e.category !== filters.category) return false;
      if (filters.from && e.transDate < filters.from) return false;
      if (filters.to && e.transDate > filters.to) return false;
      if (min !== null && e.amount < min) return false;
      if (max !== null && e.amount > max) return false;
      return true;
    });
  }, [entries, filters, nameOverrides]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = visible.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  );

  const onCategoryChange = (id: string, category: string) => {
    setError(null);
    startTransition(async () => {
      const res = await recategorizeEntryAction(id, category);
      if (!res.ok) setError(res.error ?? "Failed to update category");
    });
  };

  const startNameEdit = (e: BudgetEntry) => {
    setEditingId(e.id);
    setDraft(displayName(e));
  };

  const commitNameEdit = (entry: BudgetEntry) => {
    setEditingId(null);
    const name = draft.trim();
    if (!name || name === displayName(entry)) return;
    setError(null);
    setNameOverrides((prev) => ({ ...prev, [entry.id]: name }));
    startTransition(async () => {
      const res = await updateEntryAction(entry.id, { description: name });
      if (!res.ok) {
        setError(res.error ?? "Failed to rename transaction");
        setNameOverrides((prev) => {
          const next = { ...prev };
          delete next[entry.id];
          return next;
        });
      }
    });
  };

  // No sortValue on these columns: the table only holds the current page, so a
  // column sort would mislead. Pagination and filters stay here in the section.
  const columns: DataTableColumn<BudgetEntry>[] = [
    {
      key: "date",
      header: "Date",
      cell: (e) => <span className={styles.nowrap}>{formatDay(e.transDate)}</span>,
    },
    {
      key: "description",
      header: "Description",
      cell: (e) => (
        <div className={styles.descCell}>
          {editingId === e.id ? (
            <input
              type="text"
              className={`${styles.select} ${styles.descInput}`}
              value={draft}
              autoFocus
              onChange={(ev) => setDraft(ev.target.value)}
              onBlur={() => commitNameEdit(e)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") ev.currentTarget.blur();
                if (ev.key === "Escape") setEditingId(null);
              }}
              aria-label={`Rename ${e.description}`}
            />
          ) : (
            <button
              type="button"
              className={styles.nameButton}
              onClick={() => startNameEdit(e)}
              title="Click to rename"
            >
              {displayName(e)}
            </button>
          )}
        </div>
      ),
    },
    {
      key: "account",
      header: "Account",
      cell: (e) => <span className={styles.nowrap}>{accountLabel(e)}</span>,
    },
    {
      key: "category",
      header: "Category",
      cell: (e) => (
        <select
          className={`${styles.select} ${styles.categoryPill}`}
          value={e.category}
          disabled={isPending}
          onChange={(ev) => onCategoryChange(e.id, ev.target.value)}
          aria-label={`Category for ${e.description}`}
        >
          {BUDGET_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: (e) => (
        <span className={`${styles.nowrap} ${e.isCredit ? styles.creditAmount : ""}`}>
          {formatMoney(e.amount)}
        </span>
      ),
    },
  ];

  return (
    <Card
      title="Transactions"
      ariaLabel="Transactions"
      actions={
        <>
          <button
            type="button"
            className={styles.btn}
            onClick={() => setRecurringOpen(true)}
          >
            ↻ Subscriptions
          </button>
          <button
            type="button"
            className={styles.btn}
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((v) => !v)}
          >
            Filters{activeCount > 0 ? ` (${activeCount})` : ""}
          </button>
        </>
      }
    >

      {panelOpen && (
        <div className={styles.filterPanel}>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Search</span>
            <input
              type="text"
              placeholder="description…"
              className={styles.select}
              value={filters.search}
              onChange={(e) => set({ search: e.target.value })}
            />
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Type</span>
            <select
              className={styles.select}
              value={filters.category}
              onChange={(e) => set({ category: e.target.value })}
            >
              <option>All</option>
              {BUDGET_CATEGORIES.filter((c) => c !== "Card Payment").map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>From</span>
            <input
              type="date"
              className={styles.select}
              value={filters.from}
              onChange={(e) => set({ from: e.target.value })}
            />
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>To</span>
            <input
              type="date"
              className={styles.select}
              value={filters.to}
              onChange={(e) => set({ to: e.target.value })}
            />
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Min $</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              className={styles.select}
              value={filters.min}
              onChange={(e) => set({ min: e.target.value })}
            />
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Max $</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              className={styles.select}
              value={filters.max}
              onChange={(e) => set({ max: e.target.value })}
            />
          </label>
          <button
            type="button"
            className={styles.btn}
            disabled={activeCount === 0}
            onClick={() => setFilters(NO_FILTERS)}
          >
            Clear
          </button>
        </div>
      )}

      {error && (
        <p className={styles.errorText} role="alert">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <p className={styles.mutedText}>No transactions.</p>
      ) : (
        <div className={styles.tableBox}>
          <DataTable
            columns={columns}
            rows={pageRows}
            rowKey={(e) => e.id}
            caption="Transactions"
            hideCaption
          />
        </div>
      )}

      {recurringOpen && <RecurringModal onClose={() => setRecurringOpen(false)} />}

      {pageCount > 1 && (
        <div className={styles.pageFooter}>
          <span className={styles.mutedText}>
            {currentPage * PAGE_SIZE + 1}–
            {Math.min((currentPage + 1) * PAGE_SIZE, visible.length)} of{" "}
            {visible.length}
          </span>
          <span className={styles.statementActions}>
            <button
              type="button"
              className={styles.btn}
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              ‹ Prev
            </button>
            <span className={styles.mutedText}>
              Page {currentPage + 1} of {pageCount}
            </span>
            <button
              type="button"
              className={styles.btn}
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              Next ›
            </button>
          </span>
        </div>
      )}
    </Card>
  );
}
