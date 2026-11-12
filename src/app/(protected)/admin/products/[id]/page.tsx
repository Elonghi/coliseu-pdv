import { notFound } from "next/navigation";
import { pool } from "@/db";
import { ProductForm } from "@/components/product-form";
import { Badge, PageHeader } from "@/components/ui";
export const dynamic = "force-dynamic";
export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, categories, units] = await Promise.all([
    pool.query("SELECT * FROM products WHERE id=$1", [id]),
    pool.query("SELECT id,name FROM categories ORDER BY name"),
    pool.query("SELECT id,code,name FROM units ORDER BY name"),
  ]);
  if (!product.rows[0]) notFound();
  const current = product.rows[0];
  return <div className="section-gap">
    <PageHeader
      back={{ href: "/admin/products", label: "Produtos" }}
      title="Editar produto"
      description={<>{current.name} · <span className="mono">{current.sku}</span></>}
      actions={<Badge tone={current.active ? "ok" : "neutral"} dot>{current.active ? "Ativo" : "Inativo"}</Badge>}
    />
    <ProductForm product={current} categories={categories.rows} units={units.rows}/>
  </div>;
}
