/* Product images are authenticated route assets; bypassing next/image avoids unauthenticated optimizer fetches. */
/* eslint-disable @next/next/no-img-element */
import { ActionForm } from "./action-form";
import { productAction } from "@/modules/admin/actions";

type Option = { id: string; name: string; code?: string };
type Product = { id: string; sku: string; barcode: string | null; name: string; description: string | null; category_id: string; unit_id: string; cost_cents: number; sale_price_cents: number; max_discount_bps: number; minimum_stock: number; stock_quantity: number; can_split_into_boosters: boolean; is_loose_booster: boolean; tcg_game:string|null;tcg_set_name:string|null;tcg_collector_number:string|null;tcg_language:string|null;tcg_rarity:string|null;tcg_condition:string|null; active: boolean; image_key: string | null };

const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="card form-section">
    <div className="form-section-head"><h2>{title}</h2>{description && <p>{description}</p>}</div>
    {children}
  </section>;
}

export function ProductForm({ categories, units, product }: { categories: Option[]; units: Option[]; product?: Product }) {
  const hasTcgData = Boolean(product && (product.tcg_game || product.tcg_set_name || product.tcg_collector_number || product.tcg_language || product.tcg_rarity || product.tcg_condition));
  return <ActionForm action={productAction} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] items-start" submitLabel={product ? "Salvar alterações" : "Criar produto"} cancelHref="/admin/products" stickyActions>
    {product && <input type="hidden" name="id" value={product.id}/>}

    <div className="grid gap-5">
      <Section title="Identificação" description="Como o produto aparece no PDV, nas etiquetas e nos relatórios.">
        <div className="grid md:grid-cols-2 gap-4">
          <label className="label">SKU<input className="field" name="sku" defaultValue={product?.sku} required/></label>
          <label className="label">Código de barras<input className="field" name="barcode" defaultValue={product?.barcode ?? ""} inputMode="numeric"/><span className="field-hint">Opcional. Você pode gerar um código interno na tela de Etiquetas.</span></label>
        </div>
        <label className="label">Nome<input className="field" name="name" defaultValue={product?.name} required/></label>
        <label className="label">Descrição<textarea className="field" name="description" defaultValue={product?.description ?? ""}/></label>
      </Section>

      <Section title="Classificação">
        <div className="grid md:grid-cols-2 gap-4">
          <label className="label">Categoria<select className="field" name="categoryId" defaultValue={product?.category_id} required>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="label">Unidade<select className="field" name="unitId" defaultValue={product?.unit_id} required>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} — {unit.name}</option>)}</select></label>
        </div>
      </Section>

      <Section title="Preços e estoque">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="label">Custo (R$)<input className="field" name="cost" inputMode="decimal" defaultValue={product ? money(product.cost_cents) : "0,00"} required/></label>
          <label className="label">Venda (R$)<input className="field" name="price" inputMode="decimal" defaultValue={product ? money(product.sale_price_cents) : "0,00"} required/></label>
          <label className="label">Desconto máx. (%)<input className="field" type="number" name="maxDiscount" min="0" max="100" step="0.01" defaultValue={product ? product.max_discount_bps / 100 : 0} required/></label>
          <label className="label">Estoque mínimo<input className="field" type="number" name="minimumStock" min="0" defaultValue={product?.minimum_stock ?? 0} required/><span className="field-hint">Abaixo disso o item aparece como “baixo”.</span></label>
        </div>
        {!product && <label className="label max-w-xs">Estoque inicial<input className="field" type="number" name="initialStock" min="0" defaultValue="0" required/></label>}
        {product && <p className="notice-info"><b>Estoque atual: {product.stock_quantity}.</b> Para alterá-lo com histórico, use a tela de Estoque.</p>}
      </Section>

      <details className="card disclosure" open={hasTcgData || undefined}>
        <summary>
          <div className="form-section-head"><h2>Detalhes de TCG</h2><p>Opcionais — jogo, coleção, idioma, raridade e condição.</p></div>
          <svg className="disclosure-chevron" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </summary>
        <div className="grid md:grid-cols-3 gap-4 p-5">
          <label className="label">Jogo<input className="field" name="tcgGame" placeholder="Magic, Pokémon..." defaultValue={product?.tcg_game ?? ""}/></label>
          <label className="label">Coleção/edição<input className="field" name="tcgSetName" defaultValue={product?.tcg_set_name ?? ""}/></label>
          <label className="label">Nº de colecionador<input className="field" name="tcgCollectorNumber" defaultValue={product?.tcg_collector_number ?? ""}/></label>
          <label className="label">Idioma<input className="field" name="tcgLanguage" placeholder="Português, Inglês..." defaultValue={product?.tcg_language ?? ""}/></label>
          <label className="label">Raridade<input className="field" name="tcgRarity" defaultValue={product?.tcg_rarity ?? ""}/></label>
          <label className="label">Condição<select className="field" name="tcgCondition" defaultValue={product?.tcg_condition ?? ""}><option value="">Não se aplica</option><option value="NM">NM — Near Mint</option><option value="SP">SP — Slightly Played</option><option value="MP">MP — Moderately Played</option><option value="HP">HP — Heavily Played</option><option value="DMG">Danificada</option><option value="SEALED">Lacrado</option></select></label>
        </div>
      </details>
    </div>

    <div className="grid gap-5">
      <Section title="Foto" description="JPEG, PNG ou WebP; até 5 MB.">
        {product?.image_key && <img src={`/api/uploads/${product.image_key}`} alt={product.name} className="w-full aspect-square object-cover rounded-xl border border-gray-200"/>}
        <label className="label">{product?.image_key ? "Substituir foto" : "Enviar foto"}<input className="field" type="file" name="image" accept="image/jpeg,image/png,image/webp"/></label>
      </Section>

      <Section title="Opções de venda">
        <label className="switch"><input type="checkbox" name="active" value="true" defaultChecked={product?.active ?? true}/><span>Produto ativo<small>Produtos inativos não podem ser vendidos no PDV.</small></span></label>
        <label className="switch"><input type="checkbox" name="canSplitIntoBoosters" value="true" defaultChecked={product?.can_split_into_boosters ?? false}/><span>Pode ser aberto em boosters<small>Habilita a abertura de boxes na tela de Estoque.</small></span></label>
        <label className="switch"><input type="checkbox" name="isLooseBooster" value="true" defaultChecked={product?.is_loose_booster ?? false}/><span>Booster avulso<small>Boosters avulsos nunca podem ser divididos novamente.</small></span></label>
      </Section>
    </div>
  </ActionForm>;
}
