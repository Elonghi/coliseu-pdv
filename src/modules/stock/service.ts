import { randomUUID } from "node:crypto";
import { pool } from "@/db";
import { AppError } from "@/lib/errors";

type SplitProductInput = { sourceProductId:string; outputProductName:string; outputQuantity:number; outputSalePriceCents:number };

export async function adjustStock(productId: string, delta: number, type: "MANUAL_IN" | "MANUAL_ADJUSTMENT" | "RETURN", notes: string, userId: string) {
  if (!Number.isInteger(delta) || delta === 0) throw new AppError("Informe uma quantidade diferente de zero.", 422);
  if (type !== "MANUAL_ADJUSTMENT" && delta < 0) throw new AppError("Este tipo só aceita entradas.", 422);
  if (notes.trim().length < 5) throw new AppError("Informe um motivo com pelo menos 5 caracteres.", 422);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ stock_quantity: number }>("SELECT stock_quantity FROM products WHERE id=$1 FOR UPDATE", [productId]);
    if (!result.rows[0]) throw new AppError("Produto não encontrado.", 404);
    const previous = result.rows[0].stock_quantity;
    const next = previous + delta;
    if (next < 0) throw new AppError("O ajuste deixaria o estoque negativo.", 409, "NEGATIVE_STOCK");
    await client.query("UPDATE products SET stock_quantity=$1,updated_at=now() WHERE id=$2", [next, productId]);
    await client.query("INSERT INTO stock_movements (product_id,type,quantity_delta,previous_quantity,new_quantity,user_id,notes) VALUES ($1,$2,$3,$4,$5,$6,$7)", [productId, type, delta, previous, next, userId, notes.trim()]);
    await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'STOCK_ADJUST','product',$2,$3)", [userId, productId, JSON.stringify({ delta, type, notes })]);
    await client.query("COMMIT"); return { previous, next };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function splitProductIntoBoosters(input: SplitProductInput, userId: string) {
  const outputName=input.outputProductName.trim();
  if (outputName.length < 3) throw new AppError("Informe o nome do booster com pelo menos 3 caracteres.",422);
  if (!Number.isInteger(input.outputQuantity)||input.outputQuantity<2) throw new AppError("A quantidade deve ser de pelo menos 2 boosters.",422);
  if (!Number.isSafeInteger(input.outputSalePriceCents)||input.outputSalePriceCents<=0) throw new AppError("Informe um valor unitário de venda válido.",422);
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const sourceResult=await client.query<{id:string;sku:string;name:string;category_id:string;unit_id:string;cost_cents:number;stock_quantity:number;can_split_into_boosters:boolean;is_loose_booster:boolean}>(`SELECT id,sku,name,category_id,unit_id,cost_cents,stock_quantity,can_split_into_boosters,is_loose_booster FROM products WHERE id=$1 FOR UPDATE`,[input.sourceProductId]);
    const source=sourceResult.rows[0];
    if(!source)throw new AppError("Produto de origem não encontrado.",404);
    if(source.is_loose_booster)throw new AppError("Um booster avulso não pode ser dividido novamente.",409,"LOOSE_BOOSTER");
    if(!source.can_split_into_boosters)throw new AppError("Este produto não está habilitado para abertura em boosters.",409,"NOT_SPLITTABLE");
    if(source.stock_quantity<1)throw new AppError("Não há estoque disponível deste produto para abrir.",409,"INSUFFICIENT_STOCK");

    const outputUnitCostCents=Math.round(source.cost_cents/input.outputQuantity);
    const namedProducts=await client.query<{id:string;stock_quantity:number;cost_cents:number;is_loose_booster:boolean}>(`SELECT id,stock_quantity,cost_cents,is_loose_booster FROM products WHERE lower(name)=lower($1) ORDER BY is_loose_booster DESC,created_at FOR UPDATE`,[outputName]);
    const existing=namedProducts.rows.find(product=>product.is_loose_booster);
    if(!existing&&namedProducts.rowCount)throw new AppError("Já existe um produto com este nome que não está marcado como booster avulso.",409,"PRODUCT_NAME_CONFLICT");

    let outputProductId:string;
    let outputPrevious=0;
    let outputNext=input.outputQuantity;
    if(existing){
      outputProductId=existing.id;outputPrevious=existing.stock_quantity;outputNext+=outputPrevious;
      const averageCost=Math.round((existing.cost_cents*outputPrevious+source.cost_cents)/outputNext);
      await client.query("UPDATE products SET cost_cents=$1,sale_price_cents=$2,stock_quantity=$3,active=true,updated_at=now() WHERE id=$4",[averageCost,input.outputSalePriceCents,outputNext,outputProductId]);
    }else{
      const packageUnit=await client.query<{id:string}>("SELECT id FROM units WHERE code='PCT' AND active=true LIMIT 1");
      const sku=`BST-${randomUUID().slice(0,8).toUpperCase()}`;
      outputProductId=(await client.query<{id:string}>(`INSERT INTO products
        (sku,name,description,category_id,unit_id,cost_cents,sale_price_cents,max_discount_bps,stock_quantity,minimum_stock,is_loose_booster,active)
        VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,0,true,true) RETURNING id`,[sku,outputName,`Booster avulso gerado pela abertura de ${source.name}.`,source.category_id,packageUnit.rows[0]?.id??source.unit_id,outputUnitCostCents,input.outputSalePriceCents,input.outputQuantity])).rows[0].id;
    }

    const sourceNext=source.stock_quantity-1;
    const splitId=(await client.query<{id:string}>(`INSERT INTO product_splits
      (source_product_id,output_product_id,source_quantity,output_quantity,source_unit_cost_cents,output_unit_cost_cents,output_sale_price_cents,user_id)
      VALUES ($1,$2,1,$3,$4,$5,$6,$7) RETURNING id`,[source.id,outputProductId,input.outputQuantity,source.cost_cents,outputUnitCostCents,input.outputSalePriceCents,userId])).rows[0].id;
    await client.query("UPDATE products SET stock_quantity=$1,updated_at=now() WHERE id=$2",[sourceNext,source.id]);
    await client.query(`INSERT INTO stock_movements (product_id,type,quantity_delta,previous_quantity,new_quantity,product_split_id,user_id,notes) VALUES
      ($1,'BOX_SPLIT_OUT',-1,$2,$3,$4,$5,$6),($7,'BOOSTER_SPLIT_IN',$8,$9,$10,$4,$5,$11)`,[source.id,source.stock_quantity,sourceNext,splitId,userId,`Abertura em ${input.outputQuantity} boosters: ${outputName}.`,outputProductId,input.outputQuantity,outputPrevious,outputNext,`Gerado pela abertura de ${source.name}.`]);
    await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'PRODUCT_SPLIT','product_split',$2,$3)",[userId,splitId,JSON.stringify({sourceProductId:source.id,outputProductId,sourceQuantity:1,outputQuantity:input.outputQuantity,sourceUnitCostCents:source.cost_cents,outputUnitCostCents,outputSalePriceCents:input.outputSalePriceCents})]);
    await client.query("COMMIT");
    return {id:splitId,sourceProductId:source.id,outputProductId,outputQuantity:input.outputQuantity,outputUnitCostCents};
  }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
}
