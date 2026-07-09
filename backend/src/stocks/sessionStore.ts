import { prisma } from "../db/prisma";
import type { StoredSession } from "./wsClient";

export type SessionStatus = "connected" | "disconnected";

// Memoized as a promise: the page fans out /status and /portfolio in
// parallel, and concurrent CREATE TABLE IF NOT EXISTS can fail in Postgres.
let tablesReady: Promise<void> | null = null;

export function ensureStocksTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = createStocksTables().catch((error) => {
      tablesReady = null;
      throw error;
    });
  }
  return tablesReady;
}

async function createStocksTables() {
  // Single row: the owner's Wealthsimple session (Render disk is ephemeral,
  // so the session must live in the DB, not on the filesystem).
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS stocks_ws_session (
      id TEXT PRIMARY KEY,
      session_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'connected',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // At most one snapshot per calendar day, written lazily on the first
  // portfolio fetch of the day; feeds future value-over-time charts.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS stocks_snapshots (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      snapshot_date DATE NOT NULL UNIQUE,
      total_value_cents BIGINT NOT NULL,
      accounts JSONB NOT NULL,
      positions JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

const ROW_ID = "singleton";

export async function loadSession(): Promise<{
  session: StoredSession;
  status: SessionStatus;
} | null> {
  await ensureStocksTables();
  const rows = await prisma.$queryRaw<Array<{ session_json: string; status: string }>>`
    SELECT session_json, status FROM stocks_ws_session WHERE id = ${ROW_ID}
  `;
  if (rows.length === 0) return null;
  try {
    const session = JSON.parse(rows[0].session_json) as StoredSession;
    const status: SessionStatus = rows[0].status === "connected" ? "connected" : "disconnected";
    return { session, status };
  } catch (error) {
    console.error("stocks_ws_session row holds invalid JSON", error);
    return null;
  }
}

export async function saveSession(session: StoredSession): Promise<void> {
  await ensureStocksTables();
  const json = JSON.stringify(session);
  await prisma.$executeRaw`
    INSERT INTO stocks_ws_session (id, session_json, status, updated_at)
    VALUES (${ROW_ID}, ${json}, 'connected', NOW())
    ON CONFLICT (id)
    DO UPDATE SET session_json = ${json}, status = 'connected', updated_at = NOW()
  `;
}

export async function markDisconnected(): Promise<void> {
  await ensureStocksTables();
  await prisma.$executeRaw`
    UPDATE stocks_ws_session SET status = 'disconnected', updated_at = NOW()
    WHERE id = ${ROW_ID}
  `;
}

export async function writeDailySnapshot(
  totalValueCents: number,
  accounts: unknown,
  positions: unknown
): Promise<void> {
  await ensureStocksTables();
  await prisma.$executeRaw`
    INSERT INTO stocks_snapshots (snapshot_date, total_value_cents, accounts, positions)
    VALUES (CURRENT_DATE, ${Math.round(totalValueCents)},
            ${JSON.stringify(accounts)}::jsonb, ${JSON.stringify(positions)}::jsonb)
    ON CONFLICT (snapshot_date) DO NOTHING
  `;
}
