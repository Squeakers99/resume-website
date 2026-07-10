"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startConnectAction, submitOtpAction } from "./actions";
import styles from "./Stocks.module.css";

type Props = {
  headline: string;
  detail: string;
  canConnect: boolean;
};

export default function ConnectCard({ headline, detail, canConnect }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "otp">("idle");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const start = () =>
    startTransition(async () => {
      setError(null);
      const result = await startConnectAction();
      if (!result.ok) {
        setError(result.error ?? "Couldn't start the login");
        return;
      }
      if (result.connected) {
        router.refresh();
        return;
      }
      setPhase("otp");
    });

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await submitOtpAction(code.trim());
      if (!result.ok) {
        setError(result.error ?? "Wealthsimple rejected the code");
        return;
      }
      router.refresh();
    });

  return (
    <section className={styles.card} aria-label="Wealthsimple connection">
      <h2 className={styles.cardHeading}>{headline}</h2>
      <p className={styles.emptyText}>{detail}</p>

      {canConnect && phase === "idle" && (
        <button type="button" className={styles.connectButton} onClick={start} disabled={pending}>
          {pending ? "Contacting Wealthsimple…" : "Connect Wealthsimple"}
        </button>
      )}

      {canConnect && phase === "otp" && (
        <form
          className={styles.otpRow}
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending && code.trim()) submit();
          }}
        >
          <input
            className={styles.otpInput}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="2FA code"
            autoComplete="one-time-code"
            inputMode="numeric"
            aria-label="Wealthsimple 2FA code"
            autoFocus
          />
          <button
            type="submit"
            className={styles.connectButton}
            disabled={pending || !code.trim()}
          >
            {pending ? "Verifying…" : "Verify"}
          </button>
        </form>
      )}

      {error && (
        <p className={styles.connectError} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
