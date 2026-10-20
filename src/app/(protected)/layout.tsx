import { requireUser } from "@/modules/auth/session";
import { ThemeProvider } from "@/components/theme-provider";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <ThemeProvider initialTheme={user.theme}>{children}</ThemeProvider>;
}
