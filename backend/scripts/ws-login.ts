// One-time (and rare re-run) interactive Wealthsimple login.
// Reads WS_EMAIL / WS_PASSWORD from backend/.env, prompts for the 2FA code,
// and persists the session to the DB the backend env points at.
// Run from backend/:  pnpm ws:login
import "dotenv/config";
import { randomUUID } from "node:crypto";
import readline from "node:readline/promises";
import { prisma } from "../src/db/prisma";
import { ensureStocksTables, saveSession } from "../src/stocks/sessionStore";
import {
  bootstrapDeviceAndClient,
  loginWithPassword,
  OtpRequiredError,
} from "../src/stocks/wsClient";

async function main() {
  const email = process.env.WS_EMAIL;
  const password = process.env.WS_PASSWORD;
  if (!email || !password) {
    console.error("Set WS_EMAIL and WS_PASSWORD in backend/.env first.");
    process.exitCode = 1;
    return;
  }

  console.log(`Target DB: ${process.env.DATABASE_OVERRIDE_URL ? "DATABASE_OVERRIDE_URL" : "DATABASE_URL"}`);
  console.log("Fetching Wealthsimple device id and client id…");
  const { wssdi, clientId } = await bootstrapDeviceAndClient();

  const sessionId = randomUUID();
  const base = { email, password, wssdi, clientId, sessionId };

  let session;
  try {
    session = await loginWithPassword(base);
  } catch (error) {
    if (!(error instanceof OtpRequiredError)) throw error;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const otp = (await rl.question("Wealthsimple 2FA code: ")).trim();
    rl.close();
    session = await loginWithPassword({ ...base, otp });
  }

  await ensureStocksTables();
  await saveSession(session);
  console.log("Session saved — the /stocks dashboard is connected (read-only scope).");
}

main()
  .catch((error) => {
    console.error("Wealthsimple login failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
