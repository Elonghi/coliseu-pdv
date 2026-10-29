/* Product images are authenticated route assets; bypassing next/image avoids unauthenticated optimizer fetches. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Package, PackageSearch, Pencil, Plus } from "lucide-react";
import { FilterBar, SearchField } from "@/components/filter-bar";
import { Badge, EmptyState, Pagination, PageHeader } from "@/components/ui";
import { pool } from "@/db";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

type ProductRow = { id: string; sku: string; name: string; sale_price_cents: number; stock_quantity: number; minimum_stock: number; active: boolean; category: string; image_key: string | null; total_count: number };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const q = query.q?.trim().slice(0, 120) ?? "";
  const category = query.category ?? "";
  const status = query.status === "active" || query.status === "inactive" ? query.status : "";
  const stock = query.stock === "low" || query.stock === "empty" ? query.stock : "";
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);

  const [products, categories] = await Promise.all([
    pool.query<ProductRow>(`SELECT p.id,p.sku,p.name,p.sale_price_cents,p.stock_quantity,p.minimum_stock,p.active,p.image_key,c.name category,count(*) OVER()::int total_count
      FROM products p JOIN categories c ON c.id=p.category_id
      WHERE ($1='' OR p.name ILIKE $2 OR p.sku ILIKE $2 OR COALESCE(p.barcode,'') ILIKE $2)
        AND ($3='' OR p.category_id::text=$3)
        AND ($4='' OR ($4='active' AND p.active) OR ($4='inactive' AND NOT p.active))
        AND ($5='' OR ($5='empty' AND p.stock_quantity=0) OR ($5='low' AND p.stock_quantity>0 AND p.stock_quantity<=p.minimum_stock))
      ORDER BY p.name LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`, [q, `%${q}%`, category, status, stock]),
    pool.query<{ id: string; name: string }>("SELECT id,name FROM categories ORDER BY name"),
  ]);
  const total = products.rows[0]?.total_count ?? 0;
  const hasFilters = Boolean(q || category || status || stock);

  return <div className="section-gap">
    <PageHeader eyebrow="Catálogo" title="Produtos" description="Cadastre, edite e acompanhe o saldo de cada item vendido na loja." actions={<Link className="btn btn-success" href="/admin/products/new"><Plus size={16}/>Novo produto</Link>}/>

    <FilterBar clearHref="/admin/products" hasFilters={hasFilters}>
      <SearchField defaultValue={q} placeholder="Nome, SKU ou código de barras"/>
      <label className="toolbar-field">Categoria<select className="field" name="category" defaultValue={category}><option value="">Todas</option>{categories.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label className="toolbar-field">Estoque<select className="field" name="stock" defaultValue={stock}><option value="">Qualquer</option><option value="low">Baixo</option><option value="empty">Sem estoque</option></select></label>
      <label className="toolbar-field">Cadastro<select className="field" name="status" defaultValue={status}><option value="">Ativos e inativos</option><option value="active">Somente ativos</option><option value="inactive">Somente inativos</option></select></label>
    </FilterBar>

    <section className="card">
      <div className="panel-head"><h2 className="panel-title">{total} produto(s)</h2></div>
      {products.rowCount ? <div className="table-wrap"><table>
        <thead><tr><th>Produto</th><th>Categoria</th><th className="num">Preço</th><th className="num">Estoque</th><th>Status</th><th className="col-actions"><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>{products.rows.map((product) => <tr key={product.id}>
          <td className="cell-wrap"><div className="flex items-center gap-3">
            {product.image_key ? <img src={`/api/uploads/${product.image_key}`} alt="" className="thumb"/> : <span className="thumb thumb-empty"><Package size={18}/></span>}
            <span className="cell-main"><Link className="link-row" href={`/admin/products/${product.id}`}>{product.name}</Link><small>{product.sku}</small></span>
          </div></td>
          <td>{product.category}</td>
          <td className="num"><b>{formatMoney(product.sale_price_cents)}</b></td>
          <td className="num"><Badge tone={product.stock_quantity === 0 ? "danger" : product.stock_quantity <= product.minimum_stock ? "warn" : "ok"}>{product.stock_quantity}</Badge></td>
          <td><Badge tone={product.active ? "ok" : "neutral"} dot>{product.active ? "Ativo" : "Inativo"}</Badge></td>
          <td className="col-actions"><Link className="btn btn-ghost btn-sm" href={`/admin/products/${product.id}`}><Pencil size={14}/>Editar</Link></td>
        </tr>)}</tbody>
      </table></div> : <EmptyState icon={PackageSearch} title="Nenhum produto encontrado" description={hasFilters ? "Nenhum item corresponde aos filtros aplicados." : "Cadastre o primeiro produto para começar a vender."} action={hasFilters ? <Link className="btn btn-ghost btn-sm" href="/admin/products">Limpar filtros</Link> : <Link className="btn btn-success btn-sm" href="/admin/products/new">Novo produto</Link>}/>}
    </section>
    <Pagination pathname="/admin/products" query={query} page={page} perPage={PAGE_SIZE} total={total}/>
  </div>;
}
