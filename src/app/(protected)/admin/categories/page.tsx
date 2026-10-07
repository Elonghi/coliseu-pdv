import { pool } from "@/db";
import { ActionForm } from "@/components/action-form";
import { categoryAction } from "@/modules/admin/actions";
export const dynamic = "force-dynamic";
export default async function CategoriesPage() {
  const categories = await pool.query("SELECT id,name,active FROM categories ORDER BY name");
  return <div className="grid gap-5"><header><p className="text-sm text-gray-500 font-bold">CATÁLOGO</p><h1 className="text-3xl font-black">Categorias</h1></header><ActionForm action={categoryAction} className="card p-4 flex flex-wrap items-end gap-3"><label className="label flex-1 min-w-56">Nova categoria<input className="field" name="name" required/></label></ActionForm><section className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{categories.rows.map(c=><ActionForm key={c.id} action={categoryAction} className="card p-4 grid gap-3"><input type="hidden" name="id" value={c.id}/><label className="label">Nome<input className="field" name="name" defaultValue={c.name}/></label><label className="flex items-center gap-2 font-bold"><input type="checkbox" name="active" value="on" defaultChecked={c.active}/> Ativa</label></ActionForm>)}</section></div>;
}
