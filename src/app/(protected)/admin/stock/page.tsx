import Link from "next/link";
import { AlertTriangle, Boxes, PackageOpen, PackageX, Pencil, Plus, SlidersHorizontal, Wallet } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { FilterBar, SearchField } from "@/components/filter-bar";
import { Modal } from "@/components/modal";
import { Badge, Chips, DateTimeCell, EmptyState, PageHeader, StatCard, Tabs } from "@/components/ui";
import { pool } from "@/db";
import { formatDate, formatSigned } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { queryHref } from "@/lib/query-string";
import { splitProductAction, stockAction } from "@/modules/admin/actions";

export const dynamic = "force-dynamic";

const movementLabel: Record<string, string> = { INITIAL: "Estoque inicial", MANUAL_IN: "Entrada manual", MANUAL_ADJUSTMENT: "Ajuste", RETURN: "Devolução", SALE: "Venda", SALE_CANCELLATION: "Cancelamento", FISCAL_ENTRY: "Entrada por NF-e", FISCAL_CANCELLATION: "Cancelamento de NF-e", BOX_SPLIT_OUT: "Box aberta", BOOSTER_SPLIT_IN: "Boosters gerados", INVENTORY_COUNT: "Contagem de inventário", PURCHASE_RECEIPT: "Recebimento de compra" };
const tabs = ["produtos", "movimentos", "parado", "aberturas"] as const;
type Tab = typeof tabs[number];

type ProductRow = { id: string; sku: string; name: string; stock_quantity: number; minimum_stock: number; cost_cents: number; active: boolean; is_loose_booster: boolean };
type MovementRow = { id: string; type: string; quantity_delta: number; previous_quantity: number; new_quantity: number; notes: string | null; created_at: Date; product: string; username: string };
type DormantRow = { id: string; sku: string; name: string; stock_quantity: number; cost_cents: number; tied_cents: number; last_sale_at: Date | null };
type SplitRow = { id: string; source_name: string; output_name: string; source_quantity: number; output_quantity: number; source_unit_cost_cents: number; output_unit_cost_cents: number; output_sale_price_cents: number; created_at: Date; user_name: string };

const situation = (stock: number, minimum: number) => stock === 0 ? { tone: "danger", label: "Sem estoque" } as const : stock <= minimum ? { tone: "warn", label: "Baixo" } as const : { tone: "ok", label: "Normal" } as const;

function AdjustForm({ productId, products }: { productId?: string; products?: { id: string; sku: string; name: string }[] }) {
  return <ActionForm action={stockAction} submitLabel="Registrar movimentação" className="grid gap-4 sm:grid-cols-2">
    {productId
      ? <input type="hidden" name="productId" value={productId}/>
      : <label className="label sm:col-span-2">Produto<select className="field" name="productId" required>{products?.map((product) => <option value={product.id} key={product.id}>{product.sku} — {product.name}</option>)}</select></label>}
    <label className="label">Tipo<select className="field" name="type"><option value="MANUAL_IN">Entrada</option><option value="MANUAL_ADJUSTMENT">Ajuste (+/-)</option><option value="RETURN">Devolução</option></select></label>
    <label className="label">Quantidade<input className="field" name="quantity" type="number" step="1" required/><span className="field-hint">Em ajustes, use um número negativo para baixar o estoque.</span></label>
    <label className="label sm:col-span-2">Motivo<input className="field" name="notes" minLength={5} placeholder="Ex.: contagem física, avaria, devolução do cliente" required/></label>
  </ActionForm>;
}

export default async function StockPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const tab: Tab = tabs.find((item) => item === query.tab) ?? "produtos";
  const status = query.status === "low" || query.status === "empty" ? query.status : "all";
  const movementType = query.type && query.type in movementLabel ? query.type : "";
  const q = query.q?.trim().slice(0, 120) ?? "";
  const statusCondition = status === "empty" ? "AND p.stock_quantity=0" : status === "low" ? "AND p.stock_quantity>0 AND p.stock_quantity<=p.minimum_stock" : "";
  const PRODUCT_LIMIT = 500;

  const [counts, sourceProducts, allProducts, products, movements, dormant, splits] = await Promise.all([
    pool.query<{ total: number; active_count: number; empty: number; low: number; value_cents: number }>("SELECT count(*)::int total,count(*) FILTER (WHERE active)::int active_count,count(*) FILTER (WHERE stock_quantity=0)::int empty,count(*) FILTER (WHERE stock_quantity>0 AND stock_quantity<=minimum_stock)::int low,COALESCE(sum(stock_quantity::bigint*cost_cents),0)::float8 value_cents FROM products"),
    pool.query<{ id: string; sku: string; name: string; stock_quantity: number; cost_cents: number }>("SELECT id,sku,name,stock_quantity,cost_cents FROM products WHERE can_split_into_boosters=true AND is_loose_booster=false AND stock_quantity>0 ORDER BY name"),
    pool.query<{ id: string; sku: string; name: string }>("SELECT id,sku,name FROM products ORDER BY active DESC,name"),
    tab === "produtos" ? pool.query<ProductRow>(`SELECT p.id,p.sku,p.name,p.stock_quantity,p.minimum_stock,p.cost_cents,p.active,p.is_loose_booster FROM products p WHERE ($1='' OR p.name ILIKE $2 OR p.sku ILIKE $2) ${statusCondition} ORDER BY p.active DESC,p.name LIMIT ${PRODUCT_LIMIT}`, [q, `%${q}%`]) : null,
    tab === "movimentos" ? pool.query<MovementRow>("SELECT sm.id,sm.type,sm.quantity_delta,sm.previous_quantity,sm.new_quantity,sm.notes,sm.created_at,p.name product,COALESCE(u.name,'Automático') username FROM stock_movements sm JOIN products p ON p.id=sm.product_id LEFT JOIN users u ON u.id=sm.user_id WHERE ($1='' OR p.name ILIKE $2 OR p.sku ILIKE $2) AND ($3='' OR sm.type::text=$3) ORDER BY sm.created_at DESC LIMIT 100", [q, `%${q}%`, movementType]) : null,
    tab === "parado" ? pool.query<DormantRow>("SELECT p.id,p.sku,p.name,p.stock_quantity,p.cost_cents,(p.stock_quantity*p.cost_cents)::int tied_cents,max(s.created_at) last_sale_at FROM products p LEFT JOIN sale_items si ON si.product_id=p.id LEFT JOIN sales s ON s.id=si.sale_id AND s.status='CONFIRMED' WHERE p.active=true AND p.stock_quantity>0 GROUP BY p.id HAVING max(s.created_at) IS NULL OR max(s.created_at)<now()-interval '90 days' ORDER BY tied_cents DESC LIMIT 50") : null,
    tab === "aberturas" ? pool.query<SplitRow>("SELECT ps.id,s.name source_name,o.name output_name,ps.source_quantity,ps.output_quantity,ps.source_unit_cost_cents,ps.output_unit_cost_cents,ps.output_sale_price_cents,ps.created_at,u.name user_name FROM product_splits ps JOIN products s ON s.id=ps.source_product_id JOIN products o ON o.id=ps.output_product_id JOIN users u ON u.id=ps.user_id ORDER BY ps.created_at DESC LIMIT 30") : null,
  ]);
  const summary = counts.rows[0];
  const tabHref = (value: Tab) => queryHref("/admin/stock", {}, { tab: value === "produtos" ? null : value });
  const hasFilters = Boolean(q || status !== "all" || movementType);

  return <div className="section-gap">
    <PageHeader
      eyebrow="Operação"
      title="Estoque"
      description="Acompanhe saldos, registre ajustes com histórico e abra caixas em boosters."
      actions={<>
        <Modal trigger={<><PackageOpen size={16}/>Abrir produto em boosters</>} title="Abrir produto em boosters" description="Baixa a quantidade de boxes/unidades informada e gera boosters avulsos. O custo de cada unidade é dividido pelos boosters que ela contém." size="lg">
          {sourceProducts.rowCount
            ? <ActionForm action={splitProductAction} submitLabel="Abrir produto" className="grid gap-4 sm:grid-cols-2">
                <label className="label sm:col-span-2">Produto para abrir<select className="field" name="sourceProductId" required>{sourceProducts.rows.map((product) => <option value={product.id} key={product.id}>{product.sku} — {product.name} · Estoque {product.stock_quantity} · Custo {formatMoney(product.cost_cents)}</option>)}</select></label>
                <label className="label">Quantidade de boxes/unidades a abrir<input className="field" name="sourceQuantity" type="number" min="1" step="1" required/></label>
                <label className="label">Boosters por box/unidade<input className="field" name="boostersPerSource" type="number" min="2" step="1" required/></label>
                <label className="label sm:col-span-2">Nome do booster avulso<input className="field" name="outputProductName" minLength={3} placeholder="Ex.: Magic Foundations — Play Booster" required/></label>
                <label className="label">Venda unitária (R$)<input className="field" name="outputSalePrice" inputMode="decimal" placeholder="0,00" required/></label>
              </ActionForm>
            : <p className="notice-warn">Não há produtos com estoque disponíveis para abertura. Habilite a opção “Pode ser aberto em boosters” no cadastro do produto.</p>}
        </Modal>
        <Modal trigger={<><Plus size={16}/>Ajustar estoque</>} triggerClassName="btn btn-primary" title="Ajustar estoque" description="Toda alteração fica registrada no histórico de movimentações.">
          <AdjustForm products={allProducts.rows}/>
        </Modal>
      </>}
    />

    <section className="stat-grid" aria-label="Resumo do estoque">
      <StatCard label="Produtos cadastrados" value={summary.total} hint={`${summary.active_count} ativo(s)`} icon={Boxes}/>
      <StatCard label="Estoque baixo" value={summary.low} tone={summary.low ? "warn" : undefined} icon={AlertTriangle} hint="Abaixo do mínimo" href={queryHref("/admin/stock", {}, { status: "low" })}/>
      <StatCard label="Sem estoque" value={summary.empty} tone={summary.empty ? "danger" : undefined} icon={PackageX} hint="Saldo zerado" href={queryHref("/admin/stock", {}, { status: "empty" })}/>
      <StatCard label="Valor em estoque" value={formatMoney(summary.value_cents)} icon={Wallet} hint="A preço de custo"/>
    </section>

    <Tabs label="Visões do estoque" items={[
      { href: tabHref("produtos"), label: "Produtos", active: tab === "produtos" },
      { href: tabHref("movimentos"), label: "Movimentações", active: tab === "movimentos" },
      { href: tabHref("parado"), label: "Estoque parado", active: tab === "parado" },
      { href: tabHref("aberturas"), label: "Aberturas de box", active: tab === "aberturas" },
    ]}/>

    {products && <>
      <FilterBar clearHref="/admin/stock" hasFilters={hasFilters}>
        <SearchField defaultValue={q} placeholder="Nome ou SKU do produto"/>
        <Chips label="Situação" items={[
          { label: "Todos", href: queryHref("/admin/stock", query, { status: null }), active: status === "all", count: summary.total },
          { label: "Baixo", href: queryHref("/admin/stock", query, { status: "low" }), active: status === "low", count: summary.low, tone: "warn" },
          { label: "Sem estoque", href: queryHref("/admin/stock", query, { status: "empty" }), active: status === "empty", count: summary.empty, tone: "danger" },
        ]}/>
      </FilterBar>
      <section className="card">
        {products.rowCount ? <div className="table-wrap"><table>
          <thead><tr><th>Produto</th><th className="num">Em estoque</th><th className="num">Mínimo</th><th>Situação</th><th className="num">Valor (custo)</th><th className="col-actions"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>{products.rows.map((product) => {
            const state = situation(product.stock_quantity, product.minimum_stock);
            return <tr key={product.id}>
              <td className="cell-wrap"><span className="cell-main"><b>{product.name}</b><small>{product.sku}{product.is_loose_booster && " · Booster avulso"}{!product.active && " · Inativo — revise preço e cadastro"}</small></span></td>
              <td className="num"><b>{product.stock_quantity}</b></td>
              <td className="num muted">{product.minimum_stock}</td>
              <td><Badge tone={state.tone} dot>{state.label}</Badge></td>
              <td className="num">{formatMoney(product.stock_quantity * product.cost_cents)}</td>
              <td className="col-actions"><div className="row-actions">
                <Modal trigger="Ajustar" triggerClassName="btn btn-ghost btn-sm" title="Ajustar estoque" description={`${product.name} · saldo atual ${product.stock_quantity}`}><AdjustForm productId={product.id}/></Modal>
                <Link className="btn btn-ghost btn-sm btn-icon" href={`/admin/products/${product.id}`} title="Editar cadastro do produto" aria-label={`Editar ${product.name}`}><Pencil size={15}/></Link>
              </div></td>
            </tr>;
          })}</tbody>
        </table></div> : <EmptyState icon={SlidersHorizontal} title="Nenhum produto encontrado" description="Ajuste a busca ou a situação selecionada."/>}
        {products.rowCount === PRODUCT_LIMIT && <p className="panel-note">Exibindo os primeiros {PRODUCT_LIMIT} produtos. Use a busca para localizar os demais.</p>}
      </section>
    </>}

    {movements && <>
      <FilterBar clearHref="/admin/stock?tab=movimentos" hasFilters={hasFilters}>
        <SearchField defaultValue={q} placeholder="Nome ou SKU do produto"/>
        <label className="toolbar-field">Tipo de movimentação<select className="field" name="type" defaultValue={movementType}><option value="">Todos os tipos</option>{Object.entries(movementLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      </FilterBar>
      <section className="card">
        <div className="panel-head"><div><h2 className="panel-title">Últimas movimentações</h2><p className="panel-desc">Até 100 registros mais recentes.</p></div></div>
        {movements.rowCount ? <div className="table-wrap"><table>
          <thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th className="num">Variação</th><th className="num">Saldo</th><th>Usuário</th><th>Observação</th></tr></thead>
          <tbody>{movements.rows.map((movement) => <tr key={movement.id}>
            <td><DateTimeCell value={movement.created_at}/></td>
            <td className="cell-wrap"><b>{movement.product}</b></td>
            <td><Badge>{movementLabel[movement.type] ?? movement.type}</Badge></td>
            <td className={`num ${movement.quantity_delta > 0 ? "pos" : "neg"}`}><b>{formatSigned(movement.quantity_delta)}</b></td>
            <td className="num muted">{movement.previous_quantity} → <b className="ink">{movement.new_quantity}</b></td>
            <td>{movement.username}</td>
            <td className="cell-wrap muted">{movement.notes || "—"}</td>
          </tr>)}</tbody>
        </table></div> : <EmptyState title="Nenhuma movimentação encontrada" description="Tente outro produto ou tipo de movimentação."/>}
      </section>
    </>}

    {dormant && <section className="card">
      <div className="panel-head"><div><h2 className="panel-title">Estoque parado — 90 dias</h2><p className="panel-desc">Produtos ativos sem venda confirmada no período, ordenados pelo capital imobilizado.</p></div>{!!dormant.rowCount && <Badge tone="warn">{formatMoney(dormant.rows.reduce((total, row) => total + row.tied_cents, 0))} parados</Badge>}</div>
      {dormant.rowCount ? <div className="table-wrap"><table>
        <thead><tr><th>Produto</th><th className="num">Estoque</th><th className="num">Capital em custo</th><th>Última venda</th></tr></thead>
        <tbody>{dormant.rows.map((row) => <tr key={row.id}>
          <td className="cell-wrap"><span className="cell-main"><b>{row.name}</b><small>{row.sku}</small></span></td>
          <td className="num">{row.stock_quantity}</td>
          <td className="num"><b>{formatMoney(row.tied_cents)}</b></td>
          <td>{row.last_sale_at ? formatDate(row.last_sale_at) : <Badge tone="warn">Nunca vendido</Badge>}</td>
        </tr>)}</tbody>
      </table></div> : <EmptyState title="Nenhum produto parado" description="Todos os produtos com estoque tiveram vendas nos últimos 90 dias."/>}
    </section>}

    {splits && <section className="card">
      <div className="panel-head"><div><h2 className="panel-title">Aberturas recentes</h2><p className="panel-desc">Caixas e unidades abertas em boosters avulsos (últimas 30).</p></div></div>
      {splits.rowCount ? <div className="table-wrap"><table>
        <thead><tr><th>Data</th><th>Origem</th><th>Booster gerado</th><th className="num">Abertas</th><th className="num">Boosters</th><th className="num">Custo da box</th><th className="num">Custo / venda unitária</th><th>Usuário</th></tr></thead>
        <tbody>{splits.rows.map((split) => <tr key={split.id}>
          <td><DateTimeCell value={split.created_at}/></td>
          <td className="cell-wrap"><b>{split.source_name}</b></td>
          <td className="cell-wrap">{split.output_name}</td>
          <td className="num">{split.source_quantity}</td>
          <td className="num">{split.output_quantity}</td>
          <td className="num">{formatMoney(split.source_unit_cost_cents)}</td>
          <td className="num">{formatMoney(split.output_unit_cost_cents)} / {formatMoney(split.output_sale_price_cents)}</td>
          <td>{split.user_name}</td>
        </tr>)}</tbody>
      </table></div> : <EmptyState icon={PackageOpen} title="Nenhuma abertura registrada" description="Quando uma box for aberta em boosters, o histórico aparece aqui."/>}
    </section>}
  </div>;
}
