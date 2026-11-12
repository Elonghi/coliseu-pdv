import { GuidedTour } from "@/components/guided-tour/guided-tour";
import { migrationStatus } from "@/modules/platform/status";
import { requireUser } from "@/modules/auth/session";
import { guideApplies } from "@/modules/onboarding/progress";
import { readGuideCookie } from "@/modules/onboarding/state";

/* Se o código novo subiu antes da migration, mostra um aviso claro em vez de erros soltos. O administrador do sistema continua
 * entrando, com o comando para aplicar. */
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const migrations = await migrationStatus();
  if (migrations.pending && !user.isPlatformAdmin) {
    return <main className="pos-choose-store"><h1>Atualização do sistema em andamento</h1><p>O banco de dados ainda está sendo atualizado para a versão nova. Tente novamente em alguns minutos. Se continuar assim, avise o administrador do sistema.</p></main>;
  }
  // Acesso guiado: liga para o administrador de um lojista, até terminar ou ser dispensado. Sem cookie é a primeira visita: o guia confere se há passos pendentes e só então dá as boas-vindas.
  const guide = guideApplies(user) ? await readGuideCookie(user.id) : "off";
  const scopeKey = user.consolidated ? "all" : user.activeStoreId ?? "none";
  return <>
    {guide !== "off" && guide !== "dismissed" && <GuidedTour firstVisit={guide === null} scopeKey={scopeKey} firstName={user.name.trim().split(/\s+/)[0]}/>}
    {migrations.pending && <div className="notice-error pending-banner" role="alert">Há migrations pendentes ({migrations.applied} de {migrations.expected} aplicadas). Faça o backup e, no terminal do app, rode: <code>node scripts/migrate.mjs --apply</code>. Até lá, só este acesso funciona.</div>}
    {children}
  </>;
}
