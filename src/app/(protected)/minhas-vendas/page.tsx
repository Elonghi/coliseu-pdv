import Link from "next/link";
import { pool } from "@/db";
import { formatMoney,saleNumber } from "@/lib/money";
import { requireUser } from "@/modules/auth/session";
export const dynamic="force-dynamic";
export default async function MySalesPage(){const user=await requireUser();const sales=await pool.query("SELECT id,created_at,total_cents,status FROM sales WHERE operator_id=$1 ORDER BY created_at DESC LIMIT 100",[user.id]);return <main className="max-w-5xl mx-auto p-5 grid gap-5"><header className="flex justify-between"><div><p className="text-sm text-gray-500 font-bold">OPERADOR</p><h1 className="text-3xl font-black">Minhas vendas</h1></div><Link href="/pdv" className="btn btn-primary">Voltar ao PDV</Link></header><section className="card table-wrap"><table><thead><tr><th>Número</th><th>Data</th><th>Total</th><th>Status</th></tr></thead><tbody>{sales.rows.map(s=><tr key={s.id}><td className="font-bold">{saleNumber(s.id)}</td><td>{new Date(s.created_at).toLocaleString("pt-BR")}</td><td>{formatMoney(s.total_cents)}</td><td>{s.status==="CONFIRMED"?"Confirmada":"Cancelada"}</td></tr>)}</tbody></table></section></main>}
