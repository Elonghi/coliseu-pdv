import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { appVersion } from "@/lib/version";
import { requireUser } from "@/modules/auth/session";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.isPlatformAdmin && !user.accountId) redirect("/plataforma");
  return <AdminShell user={user} version={appVersion}>{children}</AdminShell>;
}
