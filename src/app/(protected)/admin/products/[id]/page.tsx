import { notFound } from "next/navigation";
import Link from "next/link";
import { pool } from "@/db";
import { ProductForm } from "@/components/product-form";
export const dynamic = "force-dynamic";
export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) { const {id}=await params; const [p,c,u]=await Promise.all([pool.query("SELECT * FROM products WHERE id=$1",[id]),pool.query("SELECT id,name FROM categories ORDER BY name"),pool.query("SELECT id,code,name FROM units ORDER BY name")]); if(!p.rows[0])notFound(); return <div className="grid gap-5"><header><Link href="/admin/products" className="text-sm font-bold text-gray-500">← Produtos</Link><h1 className="text-3xl font-black mt-2">Editar produto</h1></header><ProductForm product={p.rows[0]} categories={c.rows} units={u.rows}/></div>; }
