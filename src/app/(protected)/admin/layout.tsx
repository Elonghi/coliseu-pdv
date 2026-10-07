import { AdminNav } from "@/components/admin-nav";
import { requireUser } from "@/modules/auth/session";
export default async function AdminLayout({ children }: { children: React.ReactNode }) { const user = await requireUser("ADMIN"); return <div className="min-h-screen md:grid md:grid-cols-[235px_1fr]"><AdminNav user={user}/><main className="p-5 md:p-8 min-w-0">{children}</main></div>; }
