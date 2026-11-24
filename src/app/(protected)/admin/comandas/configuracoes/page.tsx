import { Store } from "lucide-react";
import { ComandaTabs } from "@/components/comandas/comanda-tabs";
import { SettingsForm } from "@/components/comandas/settings-form";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/modules/auth/session";
import { getComandaSettings } from "@/modules/comandas/service";

export const dynamic = "force-dynamic";

export default async function ComandaSettingsPage() {
  const user = await requireUser("ADMIN");
  const header = <PageHeader eyebrow="Operação" title="Configurações das comandas" description="Ligue os pedidos pelo celular e diga onde a loja fica, para barrar pedidos feitos de longe."/>;
  if (user.consolidated) return <div className="section-gap">{header}<ComandaTabs active="configuracoes" isAdmin/><EmptyState icon={Store} title="Escolha uma loja" description="As configurações são de cada loja. Escolha a loja no seletor do menu."/></div>;
  const settings = await getComandaSettings();
  return <div className="section-gap">
    {header}
    <ComandaTabs active="configuracoes" isAdmin/>
    <section className="card p-5 grid gap-5"><SettingsForm settings={settings}/></section>
    <section className="card p-5 grid gap-2">
      <h2 className="panel-title">Privacidade e auditoria</h2>
      <p className="panel-desc">Cada acesso e cada pedido pelo celular ficam registrados: horário, IP, navegador e aparelho, e a posição informada. O cliente é avisado antes de permitir a localização.</p>
      <p className="panel-desc">Passados <b>90 dias</b>, o final do IP e a posição exata são apagados; o aparelho, o horário e o resultado ficam. A posição vem do celular e pode ser falsificada por quem entende do aparelho: ela barra o pedido remoto comum, e a auditoria é o que comprova o que aconteceu.</p>
    </section>
  </div>;
}
