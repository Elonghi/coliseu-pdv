import { pool } from "@/db";
import { GuideCoach } from "@/components/guide";
import { ProductForm } from "@/components/product-form";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/modules/auth/session";
export const dynamic = "force-dynamic";
export default async function NewProductPage() {
  const user = await requireUser();
  const [categories, units] = await Promise.all([
    pool.query("SELECT id,name FROM categories WHERE active=true ORDER BY name"),
    pool.query("SELECT id,code,name FROM units WHERE active=true ORDER BY name"),
  ]);
  return <div className="section-gap">
    <PageHeader back={{ href: "/admin/products", label: "Produtos" }} title="Novo produto" description="Preencha os dados essenciais; fotos e detalhes de TCG são opcionais."/>
    <GuideCoach user={user} steps={["product"]}/>
    <ProductForm categories={categories.rows} units={units.rows}/>
  </div>;
}
