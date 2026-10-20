import { requireUser } from "@/modules/auth/session";
import { InterfaceModeProvider } from "@/components/interface-mode-provider";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <InterfaceModeProvider initialMode={user.interfaceMode}>{children}</InterfaceModeProvider>;
}
