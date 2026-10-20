import { AdminShell } from "@/components/admin-shell";
import { requireUser } from "@/modules/auth/session";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AdminShell user={user}>{children}</AdminShell>;
}
