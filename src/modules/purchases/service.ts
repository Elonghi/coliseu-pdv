import { z } from "zod";
import { pool } from "@/db";
import { AppError } from "@/lib/errors";

export async function createSupplier(input: unknown, userId: string) {
  const parsed = z.object({ name:z.string().trim().min(2).max(180), document:z.string().regex(/^\d{14}$/).optional().or(z.literal("")), email:z.string().email().optional().or(z.literal("")), phone:z.string().trim().max(40).optional() }).parse(input);
  const result = await pool.query<{id:string}>("INSERT INTO suppliers(name,document,email,phone) VALUES ($1,$2,$3,$4) RETURNING id", [parsed.name, parsed.document || null, parsed.email || null, parsed.phone || null]);
  await pool.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,after) VALUES ($1,'SUPPLIER_CREATE','supplier',$2,$3)", [userId,result.rows[0].id,JSON.stringify(parsed)]);
  return result.rows[0].id;
}

export async function createPurchaseOrder(input: unknown, userId: string) {
  const parsed = z.object({ supplierId:z.string().uuid(), expectedAt:z.string().date().optional().or(z.literal("")), notes:z.string().trim().max(2000).optional() }).parse(input);
  const result=await pool.query<{id:string}>("INSERT INTO purchase_orders(supplier_id,expected_at,notes,created_by_id) VALUES ($1,$2,$3,$4) RETURNING id",[parsed.supplierId,parsed.expectedAt||null,parsed.notes||null,userId]);
  await pool.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,after) VALUES ($1,'PURCHASE_CREATE','purchase_order',$2,$3)",[userId,result.rows[0].id,JSON.stringify(parsed)]);
  return result.rows[0].id;
}

export async function addPurchaseItem(input:unknown,userId:string){
  const parsed=z.object({orderId:z.string().uuid(),productId:z.string().uuid(),quantity:z.number().int().positive(),unitCostCents:z.number().int().min(0)}).parse(input);
  const result=await pool.query("INSERT INTO purchase_order_items(order_id,product_id,ordered_quantity,unit_cost_cents) SELECT $1,$2,$3,$4 WHERE EXISTS(SELECT 1 FROM purchase_orders WHERE id=$1 AND status='DRAFT') ON CONFLICT(order_id,product_id) DO UPDATE SET ordered_quantity=excluded.ordered_quantity,unit_cost_cents=excluded.unit_cost_cents,updated_at=now() RETURNING id",[parsed.orderId,parsed.productId,parsed.quantity,parsed.unitCostCents]);
  if(!result.rowCount)throw new AppError("Pedido não está em rascunho.",409);
  await pool.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,after) VALUES ($1,'PURCHASE_ITEM_UPSERT','purchase_order',$2,$3)",[userId,parsed.orderId,JSON.stringify(parsed)]);
}

export async function sendPurchaseOrder(orderId:string,userId:string){
  const result=await pool.query("UPDATE purchase_orders SET status='SENT',updated_at=now() WHERE id=$1 AND status='DRAFT' AND EXISTS(SELECT 1 FROM purchase_order_items WHERE order_id=$1) RETURNING id",[orderId]);
  if(!result.rowCount)throw new AppError("Inclua itens antes de enviar o pedido.",409);
  await pool.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,after) VALUES ($1,'PURCHASE_SEND','purchase_order',$2,'{}')",[userId,orderId]);
}

export async function receivePurchaseOrder(orderId:string,quantities:{itemId:string;quantity:number}[],userId:string){
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const order=await client.query<{fiscal_invoice_id:string|null}>("SELECT fiscal_invoice_id FROM purchase_orders WHERE id=$1 AND status IN ('SENT','PARTIAL') FOR UPDATE",[orderId]);
    if(!order.rows[0])throw new AppError("Pedido não está disponível para recebimento.",409);
    if(order.rows[0].fiscal_invoice_id)throw new AppError("Pedido vinculado a NF-e é recebido automaticamente pela nota.",409);
    const requested=new Map(quantities.filter(item=>Number.isInteger(item.quantity)&&item.quantity>0).map(item=>[item.itemId,item.quantity]));
    if(!requested.size)throw new AppError("Informe ao menos uma quantidade recebida.");
    const items=await client.query<{id:string;product_id:string;ordered_quantity:number;received_quantity:number;unit_cost_cents:number;stock_quantity:number;cost_cents:number}>(`SELECT poi.id,poi.product_id,poi.ordered_quantity,poi.received_quantity,poi.unit_cost_cents,p.stock_quantity,p.cost_cents FROM purchase_order_items poi JOIN products p ON p.id=poi.product_id WHERE poi.order_id=$1 ORDER BY poi.product_id FOR UPDATE OF poi,p`,[orderId]);
    for(const item of items.rows){
      const quantity=requested.get(item.id)??0;
      if(!quantity)continue;
      if(item.received_quantity+quantity>item.ordered_quantity)throw new AppError("Quantidade recebida supera a quantidade pedida.",409);
      const nextStock=item.stock_quantity+quantity;
      const average=Math.round((item.cost_cents*item.stock_quantity+item.unit_cost_cents*quantity)/nextStock);
      await client.query("UPDATE products SET stock_quantity=$1,cost_cents=$2,updated_at=now() WHERE id=$3",[nextStock,average,item.product_id]);
      await client.query("UPDATE purchase_order_items SET received_quantity=received_quantity+$1,updated_at=now() WHERE id=$2",[quantity,item.id]);
      await client.query("INSERT INTO stock_movements(product_id,type,quantity_delta,previous_quantity,new_quantity,user_id,notes) VALUES ($1,'PURCHASE_RECEIPT',$2,$3,$4,$5,$6)",[item.product_id,quantity,item.stock_quantity,nextStock,userId,`Recebimento do pedido ${orderId}`]);
    }
    const remaining=await client.query<{total:number}>("SELECT count(*)::int total FROM purchase_order_items WHERE order_id=$1 AND received_quantity<ordered_quantity",[orderId]);
    const status=remaining.rows[0].total?"PARTIAL":"RECEIVED";
    await client.query("UPDATE purchase_orders SET status=$1::purchase_order_status,received_by_id=$2,received_at=CASE WHEN $1::text='RECEIVED' THEN now() ELSE received_at END,updated_at=now() WHERE id=$3",[status,userId,orderId]);
    await client.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,after) VALUES ($1,'PURCHASE_RECEIVE','purchase_order',$2,$3)",[userId,orderId,JSON.stringify({quantities,status})]);
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
}

export async function linkPurchaseInvoice(orderId:string,invoiceId:string,userId:string){
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const order=await client.query<{id:string;document:string|null}>("SELECT po.id,s.document FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id WHERE po.id=$1 AND po.status IN ('SENT','PARTIAL') FOR UPDATE OF po",[orderId]);
    if(!order.rowCount)throw new AppError("Pedido não está disponível.",409);
    const invoice=await client.query<{id:string;issuer_cnpj_cpf:string|null}>("SELECT id,issuer_cnpj_cpf FROM fiscal_invoices WHERE id=$1 AND status='AUTHORIZED' AND has_full_xml=true",[invoiceId]);
    if(!invoice.rowCount)throw new AppError("NF-e autorizada e completa não encontrada.",404);
    if(order.rows[0].document&&invoice.rows[0].issuer_cnpj_cpf&&order.rows[0].document!==invoice.rows[0].issuer_cnpj_cpf)throw new AppError("A empresa emitente da NF-e não corresponde ao fornecedor do pedido.",409);
    await client.query(`UPDATE purchase_order_items poi SET received_quantity=COALESCE((SELECT CASE WHEN sum(fii.quantity)=trunc(sum(fii.quantity)) THEN sum(fii.quantity)::int ELSE 0 END FROM fiscal_invoice_items fii WHERE fii.invoice_id=$1 AND fii.product_id=poi.product_id),0),updated_at=now() WHERE poi.order_id=$2`,[invoiceId,orderId]);
    const remaining=await client.query<{total:number}>("SELECT count(*)::int total FROM purchase_order_items WHERE order_id=$1 AND received_quantity<ordered_quantity",[orderId]);
    const status=remaining.rows[0].total?"PARTIAL":"RECEIVED";
    await client.query("UPDATE purchase_orders SET fiscal_invoice_id=$1,status=$2::purchase_order_status,received_by_id=$3,received_at=now(),updated_at=now() WHERE id=$4",[invoiceId,status,userId,orderId]);
    await client.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,after) VALUES ($1,'PURCHASE_LINK_INVOICE','purchase_order',$2,$3)",[userId,orderId,JSON.stringify({invoiceId,status})]);
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
}
