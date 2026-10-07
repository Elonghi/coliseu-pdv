import Link from "next/link";
import { pool } from "@/db";
import { ProductForm } from "@/components/product-form";
export const dynamic = "force-dynamic";
export default async function NewProductPage() { const [c,u]=await Promise.all([pool.query("SELECT id,name FROM categories WHERE active=true ORDER BY name"),pool.query("SELECT id,code,name FROM units WHERE active=true ORDER BY name")]); return <div className="grid gap-5"><header><Link href="/admin/products" className="text-sm font-bold text-gray-500">← Produtos</Link><h1 className="text-3xl font-black mt-2">Novo produto</h1></header><ProductForm categories={c.rows} units={u.rows}/></div>; }
