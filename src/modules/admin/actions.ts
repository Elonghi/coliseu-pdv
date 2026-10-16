"use server";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { pool } from "@/db";
import { AppError } from "@/lib/errors";
import { formatMoney, parseMoney } from "@/lib/money";
import { requirePermission, requireUser } from "@/modules/auth/session";
import { permissionOptions, permissions } from "@/modules/auth/permissions";
import { createProduct, updateProduct, type ProductInput } from "@/modules/catalog/service";
import { removeImage, saveProductImage } from "@/modules/catalog/storage";
import { cancelSale } from "@/modules/sales/service";
import { adjustStock, splitProductIntoBoosters } from "@/modules/stock/service";
import { adjustPlayerCredit, createPlayer, updatePlayer } from "@/modules/players/service";
import { syncSefazDfe } from "@/modules/fiscal/service";
import { settleFinancialInstallment } from "@/modules/finance/service";

export type ActionState = { ok?: string; error?: string };
const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a operação.";

export async function categoryAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission(permissions.CATALOG_MANAGE);
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
    maxDiscountBps: Math.round(Number(form.get("maxDiscount") ?? 0) * 100), minimumStock: Number(form.get("minimumStock") ?? 0), canSplitIntoBoosters: form.get("canSplitIntoBoosters") === "true", isLooseBooster: form.get("isLooseBooster") === "true", tcgGame:String(form.get("tcgGame")??"")||null,tcgSetName:String(form.get("tcgSetName")??"")||null,tcgCollectorNumber:String(form.get("tcgCollectorNumber")??"")||null,tcgLanguage:String(form.get("tcgLanguage")??"")||null,tcgRarity:String(form.get("tcgRarity")??"")||null,tcgCondition:String(form.get("tcgCondition")??"")||null, active: form.get("active") === "true",
  };
}

export async function productAction(_: ActionState, form: FormData): Promise<ActionState> {
  let newImage: string | null = null;
  try {
    const user = await requirePermission(permissions.CATALOG_MANAGE);
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
    const user = await requirePermission(permissions.STOCK_MANAGE);
    const type = String(form.get("type")) as "MANUAL_IN" | "MANUAL_ADJUSTMENT" | "RETURN";
    await adjustStock(String(form.get("productId")), Number(form.get("quantity")), type, String(form.get("notes") ?? ""), user.id);
    revalidatePath("/admin/stock"); return { ok: "Estoque atualizado e movimentação registrada." };
  } catch (error) { return { error: message(error) }; }
}

export async function splitProductAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission(permissions.STOCK_MANAGE);
    const result = await splitProductIntoBoosters({
      sourceProductId: String(form.get("sourceProductId") ?? ""),
      outputProductName: String(form.get("outputProductName") ?? ""),
      sourceQuantity: Number(form.get("sourceQuantity") ?? 0),
      boostersPerSource: Number(form.get("boostersPerSource") ?? 0),
      outputSalePriceCents: parseMoney(String(form.get("outputSalePrice") ?? "0")),
    }, user.id);
    revalidatePath("/admin/stock"); revalidatePath("/admin/products");
    return { ok: `${result.sourceQuantity} box(es) aberta(s): ${result.outputQuantity} boosters adicionados ao estoque com custo unitário de ${formatMoney(result.outputUnitCostCents)}.` };
  } catch (error) { return { error: message(error) }; }
}

export async function financialSettlementAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission(permissions.FINANCE_MANAGE);
    const installmentId = String(form.get("installmentId") ?? "");
    const payable = await pool.query(`SELECT i.id FROM financial_installments i
      JOIN financial_accounts a ON a.id=i.account_id
      WHERE i.id=$1 AND a.type='PAYABLE' AND a.fiscal_invoice_id IS NOT NULL`, [installmentId]);
    if (!payable.rowCount) throw new AppError("Duplicata de NF-e não encontrada.", 404);
    await settleFinancialInstallment({
      installmentId,
      amountCents: parseMoney(String(form.get("amount") ?? "0")),
      methodCode: String(form.get("methodCode") ?? ""),
      occurredAt: String(form.get("occurredAt") ?? ""),
      personName: String(form.get("personName") ?? ""),
      notes: String(form.get("notes") ?? ""),
    }, user.id);
    revalidatePath("/admin");
    revalidatePath("/admin/finance");
    revalidatePath("/admin/fiscal");
    return { ok: "Baixa registrada. Os saldos financeiro e da duplicata foram atualizados." };
  } catch (error) { return { error: message(error) }; }
}

export async function userAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission(permissions.USERS_MANAGE);
    const id = String(form.get("id") ?? "");
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const role = String(form.get("role")) as "ADMIN" | "OPERATOR";
    const active = form.get("active") === "true";
    const password = String(form.get("password") ?? "");
    if (name.length < 2 || !email.includes("@") || !["ADMIN", "OPERATOR"].includes(role)) throw new AppError("Dados do usuário inválidos.");
    if ((!id || password) && password.length < 8) throw new AppError("A senha deve ter pelo menos 8 caracteres.");
    const selected = form.getAll("permissions").map(String).filter((code) => permissionOptions.some((option) => option.code === code));
    const passwordHash = password ? await hash(password, 12) : null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");
      let targetId = id;
      if (id) {
        const before = await client.query<{ role: string; active: boolean }>("SELECT role,active FROM users WHERE id=$1 FOR UPDATE", [id]);
        if (!before.rows[0]) throw new AppError("Usuário não encontrado.");
        if (before.rows[0].role === "ADMIN" && before.rows[0].active && (role !== "ADMIN" || !active)) {
          const count = await client.query<{ count: string }>("SELECT count(*) FROM users WHERE role='ADMIN' AND active=true");
          if (Number(count.rows[0].count) <= 1) throw new AppError("Não é possível desativar ou rebaixar o último administrador.");
        }
        await client.query(`UPDATE users SET name=$1,email=$2,role=$3,active=$4,password_hash=CASE WHEN $5::text IS NULL THEN password_hash ELSE $5 END,updated_at=now() WHERE id=$6`, [name, email, role, active, passwordHash, id]);
        if (form.get("resetTotp") === "true") await client.query("UPDATE users SET totp_enabled=false,totp_secret_encrypted=NULL,updated_at=now() WHERE id=$1", [id]);
        if (!active) await client.query("DELETE FROM sessions WHERE user_id=$1", [id]);
      } else {
        const result = await client.query<{ id: string }>("INSERT INTO users (name,email,password_hash,role,active) VALUES ($1,$2,$3,$4,$5) RETURNING id", [name, email, passwordHash, role, active]);
        targetId = result.rows[0].id;
      }
      await client.query("DELETE FROM user_permissions WHERE user_id=$1", [targetId]);
      for (const permission of selected) await client.query("INSERT INTO user_permissions(user_id,permission) VALUES ($1,$2)", [targetId, permission]);
      await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,$2,'user',$3,$4)", [actor.id, id ? "USER_UPDATE" : "USER_CREATE", targetId, JSON.stringify({ name, email, role, active, permissions: selected })]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
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
  await requirePermission(permissions.CATALOG_MANAGE);
  await pool.query("UPDATE payment_methods SET active=$1,updated_at=now() WHERE code=$2", [form.get("active") === "on", String(form.get("code"))]);
  revalidatePath("/admin/payment-methods");
}

export async function playerAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission(permissions.PLAYERS_MANAGE);
    const id = String(form.get("id") ?? "");
    const input = { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), phone: String(form.get("phone") ?? ""), notes: String(form.get("notes") ?? "") };
    if (id) await updatePlayer(id, input, form.get("active") === "true", user.id);
    else await createPlayer(input, user.id);
    revalidatePath("/admin/players");
    return { ok: id ? "Jogador atualizado." : "Jogador cadastrado." };
  } catch (error) { return { error: message(error) }; }
}

export async function playerCreditAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission(permissions.PLAYERS_MANAGE);
    const value = parseMoney(String(form.get("amount") ?? "0"));
    const amount = form.get("direction") === "DEBIT" ? -value : value;
    await adjustPlayerCredit(String(form.get("playerId")), amount, String(form.get("reason") ?? ""), user.id);
    revalidatePath("/admin/players"); revalidatePath("/admin");
    return { ok: "Saldo do jogador atualizado." };
  } catch (error) { return { error: message(error) }; }
}

export async function sefazSyncAction(): Promise<ActionState> {
  try {
    const user = await requirePermission(permissions.FISCAL_MANAGE);
    const result = await syncSefazDfe(user.id);
    revalidatePath("/admin/fiscal");
    revalidatePath("/admin/fiscal/integration");
    return { ok: result.status === "completed" ? `${result.documents} documento(s) recebido(s) em ${result.batches} lote(s). ${result.recovered} resumo(s) recuperado(s) com itens.` : result.message };
  } catch (error) { return { error: message(error) }; }
}
