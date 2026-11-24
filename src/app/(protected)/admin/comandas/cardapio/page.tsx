import { Store } from "lucide-react";
import { ComandaTabs } from "@/components/comandas/comanda-tabs";
import { MenuEditor } from "@/components/comandas/menu-editor";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/modules/auth/session";
import { listMenuProducts } from "@/modules/comandas/service";

export const dynamic = "force-dynamic";

export default async function ComandaMenuPage() {
  const user = await requireUser("ADMIN");
  const header = <PageHeader eyebrow="Operação" title="Cardápio do celular" description="Escolha o que o cliente pode pedir pela comanda. Tudo começa desligado, então cartas avulsas e produtos fechados não aparecem por engano."/>;
  if (user.consolidated) return <div className="section-gap">{header}<ComandaTabs active="cardapio" isAdmin/><EmptyState icon={Store} title="Escolha uma loja" description="O cardápio é de cada loja. Escolha a loja no seletor do menu."/></div>;
  const products = await listMenuProducts();
  return <div className="section-gap">
    {header}
    <ComandaTabs active="cardapio" isAdmin/>
    {products.length
      ? <section className="card p-5"><MenuEditor products={products.map((product) => ({ id: product.id, name: product.name, sku: product.sku, priceCents: product.sale_price_cents, category: product.category, stock: product.stock, onMenu: product.available_on_comanda }))}/></section>
      : <EmptyState title="Nenhum produto ativo" description="Cadastre produtos para montar o cardápio."/>}
  </div>;
}
