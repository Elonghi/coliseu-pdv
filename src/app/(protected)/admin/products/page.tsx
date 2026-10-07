import Link from "next/link";
import { pool } from "@/db";
import { formatMoney } from "@/lib/money";
export const dynamic = "force-dynamic";
export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q?.trim() ?? "";
  const result = await pool.query(`SELECT p.id,p.sku,p.name,p.sale_price_cents,p.stock_quantity,p.minimum_stock,p.active,c.name category FROM products p JOIN categories c ON c.id=p.category_id WHERE ($1='' OR p.name ILIKE $2 OR p.sku ILIKE $2) ORDER BY p.name LIMIT 200`, [q, `%${q}%`]);
  return <div className="grid gap-5"><header className="flex flex-wrap justify-between gap-3"><div><p className="text-sm text-gray-500 font-bold">CATÁLOGO</p><h1 className="text-3xl font-black">Produtos</h1></div><Link className="btn btn-success" href="/admin/products/new">Novo produto</Link></header><form className="card p-3 flex gap-2"><input className="field" name="q" placeholder="Buscar nome ou SKU" defaultValue={q}/><button className="btn btn-primary">Buscar</button></form><section className="card table-wrap"><table><thead><tr><th>SKU</th><th>Produto</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Status</th><th></th></tr></thead><tbody>{result.rows.map(p=><tr key={p.id}><td>{p.sku}</td><td className="font-bold">{p.name}</td><td>{p.category}</td><td>{formatMoney(p.sale_price_cents)}</td><td><span className={`badge ${p.stock_quantity===0?"badge-danger":p.stock_quantity<=p.minimum_stock?"badge-warn":"badge-ok"}`}>{p.stock_quantity}</span></td><td>{p.active?"Ativo":"Inativo"}</td><td><Link className="text-blue-700 font-bold" href={`/admin/products/${p.id}`}>Editar</Link></td></tr>)}</tbody></table></section></div>;
}
