import { rawPool } from "@/db/raw";
import type { DbScope } from "@/db/scope";

/* A integração fiscal (SEFAZ) é configurada por um CNPJ no ambiente. As notas que ela traz pertencem à loja com esse CNPJ;
 * sem nenhuma loja com esse CNPJ, vale a única loja ativa do sistema. Com várias lojas e sem CNPJ cadastrado, devolve null:
 * melhor não sincronizar do que gravar as notas na loja errada. O CNPJ da loja é cadastrado no painel do sistema. */
export async function fiscalStoreScope(cnpj: string): Promise<DbScope | null> {
  const normalized = cnpj.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const byCnpj = await rawPool.query<{ id: string; account_id: string }>("SELECT id,account_id FROM stores WHERE active AND regexp_replace(upper(COALESCE(cnpj,'')),'[^A-Z0-9]','','g')=$1", [normalized]);
  const stores = byCnpj.rows.length ? byCnpj.rows : (await rawPool.query<{ id: string; account_id: string }>("SELECT id,account_id FROM stores WHERE active")).rows;
  if (stores.length !== 1) return null;
  return { accountId: stores[0].account_id, storeId: stores[0].id, storeIds: [stores[0].id] };
}
