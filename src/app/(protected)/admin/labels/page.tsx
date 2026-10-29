import { Barcode } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { FilterBar } from "@/components/filter-bar";
import { PrintButton } from "@/components/print-button";
import { PageHeader } from "@/components/ui";
import { pool } from "@/db";
import { Ean13Barcode } from "@/lib/barcode";
import { formatMoney } from "@/lib/money";
import { permissions } from "@/modules/auth/permissions";
import { requirePermission } from "@/modules/auth/session";
import { generateBarcodeAction } from "@/modules/catalog/actions";

export const dynamic = "force-dynamic";

export default async function LabelsPage({ searchParams }: { searchParams: Promise<{ productId?: string; copies?: string }> }) {
  await requirePermission(permissions.CATALOG_MANAGE);
  const query = await searchParams;
  const products = await pool.query<{ id: string; sku: string; name: string; barcode: string | null; sale_price_cents: number }>("SELECT id,sku,name,barcode,sale_price_cents FROM products WHERE active=true ORDER BY name");
  const selected = products.rows.find((product) => product.id === query.productId) ?? products.rows[0];
  const copies = Math.min(100, Math.max(1, Number(query.copies ?? 1) || 1));

  return <div className="section-gap">
    <div className="no-print"><PageHeader eyebrow="Catálogo" title="Etiquetas" description="Gere EAN-13 interno e imprima etiquetas com preço, SKU e código de barras."/></div>

    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] items-end no-print">
      <FilterBar clearHref="/admin/labels" hasFilters={false}>
        <label className="toolbar-field toolbar-grow">Produto<select className="field" name="productId" defaultValue={selected?.id}>{products.rows.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></label>
        <label className="toolbar-field toolbar-narrow">Cópias<input className="field" type="number" min="1" max="100" name="copies" defaultValue={copies}/></label>
      </FilterBar>
      <PrintButton/>
    </section>

    {selected && !selected.barcode && <ActionForm action={generateBarcodeAction} submitLabel="Gerar código interno" className="card form-section no-print">
      <input type="hidden" name="productId" value={selected.id}/>
      <div className="form-section-head"><h2>Este produto ainda não possui código de barras</h2><p>Gere um EAN-13 interno para poder imprimir a etiqueta.</p></div>
    </ActionForm>}

    {selected?.barcode
      ? <><h2 className="panel-title no-print">Pré-visualização · {copies} etiqueta(s)</h2><section className="label-sheet">{Array.from({ length: copies }, (_, index) => <article className="print-label" key={index}><b className="block truncate">{selected.name}</b><span className="text-xs">{selected.sku}</span><strong className="block text-xl">{formatMoney(selected.sale_price_cents)}</strong><Ean13Barcode value={selected.barcode}/></article>)}</section></>
      : <p className="notice-error no-print"><Barcode size={16} className="inline mr-1"/>Gere o código interno antes de imprimir.</p>}
  </div>;
}
