import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { pool } from "@/db";
import { permissions } from "@/modules/auth/permissions";
import { requirePermission } from "@/modules/auth/session";
import {
  inventoryCancelAction,
  inventoryFinalizeAction,
  inventoryItemAction,
} from "@/modules/inventory/actions";

export const dynamic = "force-dynamic";

type InventoryItem = {
  id: string;
  sku: string;
  name: string;
  expected_quantity: number;
  counted_quantity: number | null;
  notes: string | null;
};

export default async function InventoryDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(permissions.INVENTORY_MANAGE);
  const { id } = await params;
  const [count, items] = await Promise.all([
    pool.query("SELECT id,name,status,notes,created_at,finalized_at FROM inventory_counts WHERE id=$1", [id]),
    pool.query<InventoryItem>(`SELECT i.id,p.sku,p.name,i.expected_quantity,i.counted_quantity,i.notes
      FROM inventory_count_items i JOIN products p ON p.id=i.product_id
      WHERE i.count_id=$1 ORDER BY p.name`, [id]),
  ]);
  if (!count.rows[0]) notFound();
  const data = count.rows[0];
  const open = data.status === "OPEN";

  return <div className="grid gap-5">
    <header>
      <p className="text-sm text-gray-500 font-bold">INVENTÁRIO</p>
      <h1 className="text-3xl font-black">{data.name}</h1>
      <p>{data.status} · {items.rows.filter((row) => row.counted_quantity !== null).length}/{items.rowCount} contados</p>
    </header>
    {open && <section className="grid lg:grid-cols-2 gap-3">
      <ActionForm action={inventoryFinalizeAction} submitLabel="Finalizar e ajustar estoque" className="card p-4 grid gap-2">
        <input type="hidden" name="countId" value={id}/>
        <p className="text-sm">Todos os produtos precisam estar contados. A finalização é transacional.</p>
      </ActionForm>
      <ActionForm action={inventoryCancelAction} submitLabel="Cancelar inventário" className="card p-4 grid gap-2">
        <input type="hidden" name="countId" value={id}/>
        <label className="label">Motivo<input className="field" name="reason" minLength={5} required/></label>
      </ActionForm>
    </section>}
    <section className="grid gap-2">
      {items.rows.map((item) => open
        ? <ActionForm key={item.id} action={inventoryItemAction} submitLabel="Salvar contagem" className="card p-4 grid md:grid-cols-[1fr_120px_1fr_auto] gap-3 items-end">
            <input type="hidden" name="countId" value={id}/>
            <input type="hidden" name="itemId" value={item.id}/>
            <div><b>{item.sku} · {item.name}</b><small className="block text-gray-500">Sistema: {item.expected_quantity}</small></div>
            <label className="label">Contado<input className="field" type="number" min="0" name="countedQuantity" defaultValue={item.counted_quantity ?? ""} required/></label>
            <label className="label">Observação<input className="field" name="notes" defaultValue={item.notes ?? ""}/></label>
          </ActionForm>
        : <article key={item.id} className="card p-4 grid md:grid-cols-[1fr_130px_130px_1fr] gap-3">
            <div><b>{item.sku} · {item.name}</b></div>
            <span>Sistema: <b>{item.expected_quantity}</b></span>
            <span>Contado: <b>{item.counted_quantity ?? "—"}</b></span>
            <span>Diferença: <b>{item.counted_quantity === null ? "—" : item.counted_quantity - item.expected_quantity}</b>{item.notes && <small className="block text-gray-500">{item.notes}</small>}</span>
          </article>)}
    </section>
  </div>;
}
