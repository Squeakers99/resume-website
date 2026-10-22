import { redirect } from "next/navigation";
import { getOwnerSession, signOut } from "@/lib/auth";
import { getBackendConnected } from "@/lib/dashboard-cache";
import DashboardShell from "./_shell/DashboardShell";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getOwnerSession();
  if (!session) redirect("/login");

  const backendConnected = await getBackendConnected();

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <DashboardShell
      email={session.user?.email ?? "Unknown"}
      backendConnected={backendConnected}
      signOutAction={signOutAction}
    >
      {children}
    </DashboardShell>
  );
}
