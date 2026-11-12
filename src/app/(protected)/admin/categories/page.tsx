import { Boxes } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { pool } from "@/db";
import { categoryAction } from "@/modules/admin/actions";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const categories = await pool.query<{ id: string; name: string; active: boolean; products: number }>("SELECT c.id,c.name,c.active,count(p.id)::int products FROM categories c LEFT JOIN products p ON p.category_id=c.id GROUP BY c.id ORDER BY c.name");
  return <div className="section-gap">
    <PageHeader eyebrow="Catálogo" title="Categorias" description="Agrupe os produtos para facilitar buscas e relatórios. Categorias inativas não aparecem ao cadastrar novos produtos."/>

    <ActionForm action={categoryAction} submitLabel="Adicionar categoria" inline className="card flex flex-wrap items-end gap-3 p-4">
      <label className="label flex-1 min-w-56">Nova categoria<input className="field" name="name" placeholder="Ex.: Acessórios TCG" required/></label>
    </ActionForm>

    <section className="card">
      <div className="panel-head"><h2 className="panel-title">{categories.rowCount} categoria(s)</h2></div>
      {categories.rowCount ? categories.rows.map((category) => <ActionForm key={category.id} action={categoryAction} inline submitLabel="Salvar" className="row-form grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <input type="hidden" name="id" value={category.id}/>
        <input className="field" name="name" defaultValue={category.name} aria-label={`Nome da categoria ${category.name}`} required/>
        <Badge>{category.products} produto(s)</Badge>
        <label className="switch"><input type="checkbox" name="active" value="on" defaultChecked={category.active}/><span>Ativa</span></label>
      </ActionForm>) : <EmptyState icon={Boxes} title="Nenhuma categoria" description="Crie a primeira categoria para começar a cadastrar produtos."/>}
    </section>
  </div>;
}
