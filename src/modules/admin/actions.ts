"use server";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { pool } from "@/db";
import { AppError } from "@/lib/errors";
import { parseMoney } from "@/lib/money";
import { requireUser } from "@/modules/auth/session";
import { createProduct, updateProduct, type ProductInput } from "@/modules/catalog/service";
import { removeImage, saveProductImage } from "@/modules/catalog/storage";
import { cancelSale } from "@/modules/sales/service";
import { adjustStock } from "@/modules/stock/service";

export type ActionState = { ok?: string; error?: string };
const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a operação.";

export async function categoryAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("ADMIN");
    const id = String(form.get("id") ?? "");
    const name = String(form.get("name") ?? "").trim();
    if (name.length < 2) throw new AppError("Informe um nome válido.");
    if (id) await pool.query("UPDATE categories SET name=$1,active=$2,updated_at=now() WHERE id=$3", [name, form.get("active") === "on", id]);
    else await pool.query("INSERT INTO categories (name) VALUES ($1)", [name]);
    await pool.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,$2,'category',$3,$4)", [user.id, id ? "CATEGORY_UPDATE" : "CATEGORY_CREATE", id || name, JSON.stringify({ name })]);
    revalidatePath("/admin/categories"); return { ok: id ? "Categoria atualizada." : "Categoria criada." };
  } catch (error) { return { error: message(error) }; }
}

function productInput(form: FormData): ProductInput {
  return {
    sku: String(form.get("sku") ?? ""), barcode: String(form.get("barcode") ?? "") || null, name: String(form.get("name") ?? ""), description: String(form.get("description") ?? "") || null,
    categoryId: String(form.get("categoryId") ?? ""), unitId: String(form.get("unitId") ?? ""), costCents: parseMoney(String(form.get("cost") ?? "0")), salePriceCents: parseMoney(String(form.get("price") ?? "0")),
    maxDiscountBps: Math.round(Number(form.get("maxDiscount") ?? 0) * 100), minimumStock: Number(form.get("minimumStock") ?? 0), active: form.get("active") === "true",
  };
}

export async function productAction(_: ActionState, form: FormData): Promise<ActionState> {
  let newImage: string | null = null;
  try {
    const user = await requireUser("ADMIN");
    const id = String(form.get("id") ?? "");
    const file = form.get("image");
    if (file instanceof File && file.size) newImage = await saveProductImage(file);
    if (id) {
      const old = await pool.query<{ image_key: string | null }>("SELECT image_key FROM products WHERE id=$1", [id]);
      await updateProduct(id, productInput(form), user.id, newImage);
      if (newImage) await removeImage(old.rows[0]?.image_key);
      revalidatePath(`/admin/products/${id}`); revalidatePath("/admin/products"); return { ok: "Produto atualizado." };
    }
    const idCreated = await createProduct(productInput(form), Number(form.get("initialStock") ?? 0), user.id, newImage);
    revalidatePath("/admin/products"); redirect(`/admin/products/${idCreated}`);
  } catch (error) { if (newImage) await removeImage(newImage); if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw error; return { error: message(error) }; }
}

export async function stockAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requireUser("ADMIN");
    const type = String(form.get("type")) as "MANUAL_IN" | "MANUAL_ADJUSTMENT" | "RETURN";
    await adjustStock(String(form.get("productId")), Number(form.get("quantity")), type, String(form.get("notes") ?? ""), user.id);
    revalidatePath("/admin/stock"); return { ok: "Estoque atualizado e movimentação registrada." };
  } catch (error) { return { error: message(error) }; }
}

export async function userAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const actor = await requireUser("ADMIN");
    const id = String(form.get("id") ?? "");
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const role = String(form.get("role")) as "ADMIN" | "OPERATOR";
    const active = form.get("active") === "true";
    const password = String(form.get("password") ?? "");
    if (name.length < 2 || !email.includes("@") || !["ADMIN", "OPERATOR"].includes(role)) throw new AppError("Dados do usuário inválidos.");
    if (id) {
      const before = await pool.query<{ role: string; active: boolean }>("SELECT role,active FROM users WHERE id=$1", [id]);
      if (!before.rows[0]) throw new AppError("Usuário não encontrado.");
      if (before.rows[0].role === "ADMIN" && before.rows[0].active && (role !== "ADMIN" || !active)) {
        const count = await pool.query<{ count: string }>("SELECT count(*) FROM users WHERE role='ADMIN' AND active=true");
        if (Number(count.rows[0].count) <= 1) throw new AppError("Não é possível desativar ou rebaixar o último administrador.");
      }
      if (password && password.length < 8) throw new AppError("A senha deve ter pelo menos 8 caracteres.");
      await pool.query(`UPDATE users SET name=$1,email=$2,role=$3,active=$4,password_hash=CASE WHEN $5::text IS NULL THEN password_hash ELSE $5 END,updated_at=now() WHERE id=$6`, [name, email, role, active, password ? await hash(password, 12) : null, id]);
      if (!active) await pool.query("DELETE FROM sessions WHERE user_id=$1", [id]);
    } else {
      if (password.length < 8) throw new AppError("A senha deve ter pelo menos 8 caracteres.");
      const result = await pool.query<{ id: string }>("INSERT INTO users (name,email,password_hash,role,active) VALUES ($1,$2,$3,$4,$5) RETURNING id", [name, email, await hash(password, 12), role, active]);
      form.set("id", result.rows[0].id);
    }
    await pool.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,$2,'user',$3,$4)", [actor.id, id ? "USER_UPDATE" : "USER_CREATE", id || email, JSON.stringify({ name, email, role, active })]);
    revalidatePath("/admin/users"); return { ok: id ? "Usuário atualizado." : "Usuário criado." };
  } catch (error: unknown) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") return { error: "E-mail já cadastrado." };
    return { error: message(error) };
  }
}

export async function cancelSaleAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { const user = await requireUser("ADMIN"); await cancelSale(Number(form.get("saleId")), String(form.get("reason") ?? ""), user.id); revalidatePath("/admin/sales"); return { ok: "Venda cancelada e estoque devolvido." }; }
  catch (error) { return { error: message(error) }; }
}

export async function paymentMethodAction(form: FormData) {
  await requireUser("ADMIN");
  await pool.query("UPDATE payment_methods SET active=$1,updated_at=now() WHERE code=$2", [form.get("active") === "on", String(form.get("code"))]);
  revalidatePath("/admin/payment-methods");
}
