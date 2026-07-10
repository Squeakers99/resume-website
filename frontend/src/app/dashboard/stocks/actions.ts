"use server";

import { revalidatePath } from "next/cache";
import { getOwnerSession } from "@/lib/auth";
import {
  getSecurityChart,
  getSecurityDetail,
  getSecurityNews,
  startStocksConnect,
  submitStocksOtp,
  type StocksChartPeriod,
  type StocksChartPoint,
  type StocksNewsItem,
  type StocksSecurityDetail,
} from "@/lib/server-api";

// Server actions are public HTTP endpoints — every one of them must
// re-verify the session, independently of the layout gate.
async function assertOwner(): Promise<void> {
  const session = await getOwnerSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
}

export type ConnectActionResult = {
  ok: boolean;
  otpRequired?: boolean;
  connected?: boolean;
  error?: string;
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";

export async function startConnectAction(): Promise<ConnectActionResult> {
  try {
    await assertOwner();
    const result = await startStocksConnect();
    if (result.connected) revalidatePath("/dashboard/stocks");
    return { ok: true, otpRequired: result.otpRequired, connected: result.connected };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function submitOtpAction(code: string): Promise<ConnectActionResult> {
  try {
    await assertOwner();
    const result = await submitStocksOtp(code);
    revalidatePath("/dashboard/stocks");
    return { ok: true, connected: result.connected };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export type SecurityDetailResult =
  | { ok: true; detail: StocksSecurityDetail }
  | { ok: false; error: string };

export async function securityDetailAction(id: string): Promise<SecurityDetailResult> {
  try {
    await assertOwner();
    return { ok: true, detail: await getSecurityDetail(id) };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export type SecurityChartResult =
  | { ok: true; points: StocksChartPoint[] }
  | { ok: false; error: string };

export async function securityChartAction(
  id: string,
  period: StocksChartPeriod
): Promise<SecurityChartResult> {
  try {
    await assertOwner();
    const { points } = await getSecurityChart(id, period);
    return { ok: true, points };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export type SecurityNewsResult =
  | { ok: true; items: StocksNewsItem[]; tldr: string | null }
  | { ok: false; error: string };

export async function securityNewsAction(id: string): Promise<SecurityNewsResult> {
  try {
    await assertOwner();
    const { items, tldr } = await getSecurityNews(id);
    return { ok: true, items, tldr };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
