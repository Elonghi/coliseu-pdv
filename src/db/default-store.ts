/* Cria a conta do proprietário e a loja inicial, e vincula os usuários que já existem. Pode ser repetido sem efeito colateral.
 * A migration 0014_multi_conta_lojas contém exatamente estas instruções (tests/accounts-stores.integration.test.ts confere)
 * e o seed as reaplica em instalações novas, onde os usuários nascem depois da migration.
 * Regras: a operação atual vira uma conta com uma loja; o administrador ativo mais antigo é o lojista titular;
 * todos os usuários da conta ficam vinculados à loja. Contas e lojas já existentes nunca são alteradas. */
export const defaultStoreName = "Coliseu TCG";

export const defaultStoreBackfill: string[] = [
  `INSERT INTO "accounts" ("name") SELECT '${defaultStoreName}' WHERE EXISTS (SELECT 1 FROM "users") AND NOT EXISTS (SELECT 1 FROM "accounts")`,
  `INSERT INTO "stores" ("account_id","name") SELECT a."id",'${defaultStoreName}' FROM "accounts" a WHERE NOT EXISTS (SELECT 1 FROM "stores")`,
  `UPDATE "users" SET "account_id"=(SELECT "id" FROM "accounts" ORDER BY "created_at","id" LIMIT 1) WHERE "account_id" IS NULL AND EXISTS (SELECT 1 FROM "accounts")`,
  `UPDATE "users" SET "is_account_owner"=true WHERE "id"=(SELECT "id" FROM "users" WHERE "role"='ADMIN' AND "account_id" IS NOT NULL ORDER BY "active" DESC,"created_at","id" LIMIT 1) AND NOT EXISTS (SELECT 1 FROM "users" WHERE "is_account_owner")`,
  `INSERT INTO "user_stores" ("user_id","store_id") SELECT u."id",s."id" FROM "users" u JOIN "stores" s ON s."account_id"=u."account_id" ON CONFLICT DO NOTHING`,
];
