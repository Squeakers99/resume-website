"use server";

import { revalidatePath } from "next/cache";
import { getOwnerSession } from "@/lib/auth";
import { startStocksConnect, submitStocksOtp } from "@/lib/server-api";

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
