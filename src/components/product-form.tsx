/* Product images are authenticated route assets; bypassing next/image avoids unauthenticated optimizer fetches. */
/* eslint-disable @next/next/no-img-element */
import { ActionForm } from "./action-form";
import { productAction } from "@/modules/admin/actions";

type Option = { id: string; name: string; code?: string };
type Product = { id: string; sku: string; barcode: string | null; name: string; description: string | null; category_id: string; unit_id: string; cost_cents: number; sale_price_cents: number; max_discount_bps: number; minimum_stock: number; stock_quantity: number; active: boolean; image_key: string | null };
export function ProductForm({ categories, units, product }: { categories: Option[]; units: Option[]; product?: Product }) {
  return <ActionForm action={productAction} className="card p-5 grid gap-5 max-w-4xl" >
    {product && <input type="hidden" name="id" value={product.id}/>}<div className="grid md:grid-cols-2 gap-4"><label className="label">SKU<input className="field" name="sku" defaultValue={product?.sku} required/></label><label className="label">Código de barras<input className="field" name="barcode" defaultValue={product?.barcode ?? ""}/></label></div>
    <label className="label">Nome<input className="field" name="name" defaultValue={product?.name} required/></label><label className="label">Descrição<textarea className="field min-h-24" name="description" defaultValue={product?.description ?? ""}/></label>
    <div className="grid md:grid-cols-2 gap-4"><label className="label">Categoria<select className="field" name="categoryId" defaultValue={product?.category_id} required>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="label">Unidade<select className="field" name="unitId" defaultValue={product?.unit_id} required>{units.map(u=><option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}</select></label></div>
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4"><label className="label">Custo (R$)<input className="field" name="cost" inputMode="decimal" defaultValue={product ? (product.cost_cents/100).toFixed(2).replace(".",",") : "0,00"} required/></label><label className="label">Venda (R$)<input className="field" name="price" inputMode="decimal" defaultValue={product ? (product.sale_price_cents/100).toFixed(2).replace(".",",") : "0,00"} required/></label><label className="label">Desconto máx. (%)<input className="field" type="number" name="maxDiscount" min="0" max="100" step="0.01" defaultValue={product ? product.max_discount_bps/100 : 0} required/></label><label className="label">Estoque mínimo<input className="field" type="number" name="minimumStock" min="0" defaultValue={product?.minimum_stock ?? 0} required/></label></div>
    {!product && <label className="label">Estoque inicial<input className="field" type="number" name="initialStock" min="0" defaultValue="0" required/></label>}
    {product && <p className="rounded-lg bg-slate-100 p-3 text-sm"><b>Estoque atual:</b> {product.stock_quantity}. Use a tela de estoque para alterá-lo com histórico.</p>}
    <label className="label">Foto (JPEG, PNG ou WebP; até 5 MB)<input className="field" type="file" name="image" accept="image/jpeg,image/png,image/webp"/></label>{product?.image_key && <img src={`/api/uploads/${product.image_key}`} alt={product.name} className="w-28 h-28 object-cover rounded-xl border"/>}
    <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="active" value="true" defaultChecked={product?.active ?? true}/> Produto ativo</label>
  </ActionForm>;
}
