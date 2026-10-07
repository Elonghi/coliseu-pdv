import { requireUser } from "@/modules/auth/session";
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) { await requireUser(); return children; }
