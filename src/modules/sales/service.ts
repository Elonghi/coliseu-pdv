import { pool } from "@/db";
import { AppError } from "@/lib/errors";
import { calculateDiscount, saleNumber } from "@/lib/money";
import { checkoutSchema, type CheckoutInput } from "./schemas";

type LockedProduct = { id: string; sku: string; name: string; active: boolean; stock_quantity: number; sale_price_cents: number; cost_cents: number; max_discount_bps: number; unit_code: string };

export async function createSale(input: CheckoutInput, operatorId: string) {
  const parsed = checkoutSchema.parse(input);
  const productIds = parsed.items.map((i) => i.productId);
  if (new Set(productIds).size !== productIds.length) throw new AppError("O carrinho contém produtos duplicados.", 422, "INVALID_CART");
  if (new Set(parsed.payments.map((p) => p.methodCode)).size !== parsed.payments.length) throw new AppError("Repita cada forma de pagamento apenas uma vez.", 422, "INVALID_PAYMENT");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<LockedProduct>(`SELECT p.id,p.sku,p.name,p.active,p.stock_quantity,p.sale_price_cents,p.cost_cents,p.max_discount_bps,u.code AS unit_code FROM products p JOIN units u ON u.id=p.unit_id WHERE p.id=ANY($1::uuid[]) ORDER BY p.id FOR UPDATE OF p`, [[...productIds].sort()]);
    if (locked.rowCount !== parsed.items.length) throw new AppError("Um produto do carrinho não existe.", 422, "PRODUCT_NOT_FOUND");
    const byId = new Map(locked.rows.map((p) => [p.id, p]));
    const calculated = parsed.items.map((item) => {
      const product = byId.get(item.productId)!;
      if (!product.active) throw new AppError(`${product.name} está inativo.`, 409, "PRODUCT_INACTIVE");
      if (product.stock_quantity < item.quantity) throw new AppError(`Estoque insuficiente para ${product.name}. Disponível: ${product.stock_quantity}.`, 409, "INSUFFICIENT_STOCK");
      if (item.discountBasisPoints > product.max_discount_bps) throw new AppError(`Desconto de ${product.name} supera o máximo permitido.`, 422, "DISCOUNT_LIMIT");
      const grossCents = product.sale_price_cents * item.quantity;
      const discountCents = calculateDiscount(grossCents, item.discountBasisPoints);
      return { ...item, product, grossCents, discountCents, totalCents: grossCents - discountCents };
    });
    const subtotalCents = calculated.reduce((sum, i) => sum + i.grossCents, 0);
    const discountCents = calculated.reduce((sum, i) => sum + i.discountCents, 0);
    const totalCents = subtotalCents - discountCents;
    if (totalCents <= 0 || !Number.isSafeInteger(totalCents) || totalCents > 2_147_483_647) throw new AppError("Total da venda inválido.", 422, "INVALID_TOTAL");
    const methodCodes = parsed.payments.map((p) => p.methodCode);
    const methods = await client.query("SELECT code FROM payment_methods WHERE code=ANY($1::text[]) AND active=true", [methodCodes]);
    if (methods.rowCount !== methodCodes.length) throw new AppError("Forma de pagamento inválida ou inativa.", 422, "INVALID_PAYMENT_METHOD");
    if (parsed.payments.reduce((sum, p) => sum + p.amountAppliedCents, 0) !== totalCents) throw new AppError("A soma dos pagamentos deve ser igual ao total da venda.", 422, "PAYMENT_MISMATCH");
    for (const payment of parsed.payments) {
      if (payment.methodCode === "CASH") {
        if ((payment.amountReceivedCents ?? 0) < payment.amountAppliedCents) throw new AppError("Valor recebido em dinheiro é insuficiente.", 422, "CASH_INSUFFICIENT");
      } else if (payment.amountReceivedCents !== undefined) throw new AppError("Valor recebido só é permitido para dinheiro.", 422, "INVALID_PAYMENT");
    }
    const saleResult = await client.query<{ id: number; created_at: Date }>("INSERT INTO sales (operator_id,subtotal_cents,discount_cents,total_cents) VALUES ($1,$2,$3,$4) RETURNING id,created_at", [operatorId, subtotalCents, discountCents, totalCents]);
    const sale = saleResult.rows[0];
    for (const item of calculated) {
      const p = item.product;
      await client.query(`INSERT INTO sale_items (sale_id,product_id,product_name,sku,unit_code,quantity,unit_price_cents,unit_cost_cents,discount_bps,gross_cents,discount_cents,total_cents) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [sale.id, p.id, p.name, p.sku, p.unit_code, item.quantity, p.sale_price_cents, p.cost_cents, item.discountBasisPoints, item.grossCents, item.discountCents, item.totalCents]);
      const next = p.stock_quantity - item.quantity;
      await client.query("UPDATE products SET stock_quantity=$1,updated_at=now() WHERE id=$2", [next, p.id]);
      await client.query("INSERT INTO stock_movements (product_id,type,quantity_delta,previous_quantity,new_quantity,sale_id,user_id,notes) VALUES ($1,'SALE',$2,$3,$4,$5,$6,$7)", [p.id, -item.quantity, p.stock_quantity, next, sale.id, operatorId, `Venda ${saleNumber(sale.id)}`]);
    }
    const paymentSummary = [];
    for (const payment of parsed.payments) {
      const received = payment.methodCode === "CASH" ? payment.amountReceivedCents! : null;
      const change = payment.methodCode === "CASH" ? received! - payment.amountAppliedCents : 0;
      await client.query("INSERT INTO payments (sale_id,method_code,amount_applied_cents,amount_received_cents,change_cents) VALUES ($1,$2,$3,$4,$5)", [sale.id, payment.methodCode, payment.amountAppliedCents, received, change]);
      paymentSummary.push({ ...payment, changeCents: change });
    }
    await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'SALE_CREATE','sale',$2,$3)", [operatorId, String(sale.id), JSON.stringify({ totalCents })]);
    await client.query("COMMIT");
    return { id: sale.id, number: saleNumber(sale.id), createdAt: sale.created_at, subtotalCents, discountCents, totalCents, payments: paymentSummary };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function cancelSale(saleId: number, reason: string, adminId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const saleResult = await client.query<{ id: number; status: string }>("SELECT id,status FROM sales WHERE id=$1 FOR UPDATE", [saleId]);
    const sale = saleResult.rows[0];
    if (!sale) throw new AppError("Venda não encontrada.", 404, "SALE_NOT_FOUND");
    if (sale.status === "CANCELED") throw new AppError("Esta venda já foi cancelada.", 409, "ALREADY_CANCELED");
    const items = await client.query<{ product_id: string; quantity: number }>("SELECT product_id,quantity FROM sale_items WHERE sale_id=$1 ORDER BY product_id", [saleId]);
    const ids = items.rows.map((i) => i.product_id);
    const products = await client.query<{ id: string; stock_quantity: number }>("SELECT id,stock_quantity FROM products WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [ids]);
    const stock = new Map(products.rows.map((p) => [p.id, p.stock_quantity]));
    for (const item of items.rows) {
      const previous = stock.get(item.product_id)!;
      const next = previous + item.quantity;
      await client.query("UPDATE products SET stock_quantity=$1,updated_at=now() WHERE id=$2", [next, item.product_id]);
      await client.query("INSERT INTO stock_movements (product_id,type,quantity_delta,previous_quantity,new_quantity,sale_id,user_id,notes) VALUES ($1,'SALE_CANCELLATION',$2,$3,$4,$5,$6,$7)", [item.product_id, item.quantity, previous, next, saleId, adminId, reason]);
    }
    await client.query("UPDATE sales SET status='CANCELED',canceled_by_id=$1,canceled_at=now(),cancellation_reason=$2 WHERE id=$3", [adminId, reason, saleId]);
    await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'SALE_CANCEL','sale',$2,$3)", [adminId, String(saleId), JSON.stringify({ reason })]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
