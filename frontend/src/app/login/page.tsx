import { redirect } from "next/navigation";
import { getOwnerSession, signIn } from "@/lib/auth";
import styles from "./Login.module.css";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getOwnerSession();
  if (session) redirect("/dashboard");

  const { error } = await searchParams;

  return (
    <main className={styles.wrapper}>
      <section className={styles.card} aria-label="Sign in">
        <h1 className={styles.cardTitle}>/login</h1>
        <p className={styles.cardSubtitle}>
          Dashboard access is restricted to the site owner
        </p>

        {error && (
          <p className={styles.errorNotice} role="alert">
            {error === "AccessDenied"
              ? "This account is not authorized to access the dashboard."
              : "Sign-in failed. Please try again."}
          </p>
        )}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <button type="submit" className={styles.btnPrimary}>
            Sign in with Google
          </button>
        </form>
      </section>
    </main>
  );
}
