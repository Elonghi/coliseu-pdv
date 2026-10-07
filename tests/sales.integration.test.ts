import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url=process.env.TEST_DATABASE_URL;
const suite=describe.runIf(Boolean(url));
suite("vendas transacionais com PostgreSQL",()=>{
  let pool: typeof import("@/db").pool; let createSale: typeof import("@/modules/sales/service").createSale; let cancelSale: typeof import("@/modules/sales/service").cancelSale;
  let operatorId:string,adminId:string,productId:string;
  beforeAll(async()=>{
    if(!url||!new URL(url).pathname.toLowerCase().includes("test"))throw new Error("TEST_DATABASE_URL deve apontar para um banco com 'test' no nome.");
    process.env.DATABASE_URL=url;
    ({pool}=await import("@/db"));({createSale,cancelSale}=await import("@/modules/sales/service"));
    await pool.query("TRUNCATE audit_logs,stock_movements,payments,sale_items,sales,sessions,products,categories,units,payment_methods,users RESTART IDENTITY CASCADE");
    const users=await pool.query<{id:string}>(`INSERT INTO users(name,email,password_hash,role) VALUES ('Admin','admin@test.local','x','ADMIN'),('Operador','op@test.local','x','OPERATOR') RETURNING id,role`);adminId=users.rows[0].id;operatorId=users.rows[1].id;
    await pool.query("INSERT INTO payment_methods(code,name,sort_order) VALUES ('CASH','Dinheiro',0),('PIX','PIX',1),('DEBIT_CARD','Débito',2)");
    const unit=await pool.query<{id:string}>("INSERT INTO units(code,name) VALUES ('UN','Unidade') RETURNING id");const cat=await pool.query<{id:string}>("INSERT INTO categories(name) VALUES ('Teste') RETURNING id");
    const product=await pool.query<{id:string}>(`INSERT INTO products(sku,name,category_id,unit_id,cost_cents,sale_price_cents,max_discount_bps,stock_quantity,minimum_stock) VALUES ('T-1','Produto teste',$1,$2,500,900,1000,3,1) RETURNING id`,[cat.rows[0].id,unit.rows[0].id]);productId=product.rows[0].id;
  });
  afterAll(async()=>{await pool?.end()});
  it("persiste venda, snapshot, pagamentos divididos e baixa",async()=>{const sale=await createSale({items:[{productId,quantity:2,discountBasisPoints:500}],payments:[{methodCode:"PIX",amountAppliedCents:1000},{methodCode:"CASH",amountAppliedCents:710,amountReceivedCents:1000}]},operatorId);expect(sale.totalCents).toBe(1710);expect(sale.payments[1].changeCents).toBe(290);const state=await pool.query("SELECT stock_quantity FROM products WHERE id=$1",[productId]);expect(state.rows[0].stock_quantity).toBe(1);const item=await pool.query("SELECT unit_price_cents FROM sale_items WHERE sale_id=$1",[sale.id]);expect(item.rows[0].unit_price_cents).toBe(900);await pool.query("UPDATE products SET sale_price_cents=1200 WHERE id=$1",[productId]);expect(item.rows[0].unit_price_cents).toBe(900);await cancelSale(sale.id,"Cancelamento de teste",adminId);expect((await pool.query("SELECT stock_quantity FROM products WHERE id=$1",[productId])).rows[0].stock_quantity).toBe(3)});
  it("impede desconto acima do limite",async()=>{await expect(createSale({items:[{productId,quantity:1,discountBasisPoints:1100}],payments:[{methodCode:"PIX",amountAppliedCents:1068}]},operatorId)).rejects.toMatchObject({code:"DISCOUNT_LIMIT"})});
  it("serializa duas vendas concorrentes do último item",async()=>{await pool.query("UPDATE products SET stock_quantity=1,sale_price_cents=900 WHERE id=$1",[productId]);const input={items:[{productId,quantity:1,discountBasisPoints:0}],payments:[{methodCode:"PIX",amountAppliedCents:900}]};const results=await Promise.allSettled([createSale(input,operatorId),createSale(input,operatorId)]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(results.filter(r=>r.status==="rejected")).toHaveLength(1);expect((await pool.query("SELECT stock_quantity FROM products WHERE id=$1",[productId])).rows[0].stock_quantity).toBe(0)});
});
