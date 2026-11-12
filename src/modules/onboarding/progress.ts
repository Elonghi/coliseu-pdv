import { pool } from "@/db";
import { guideSteps, type GuideStepDefinition, type GuideStepId } from "./steps";

/* Primeiros passos do lojista. O progresso não tem flag no banco: cada passo se marca sozinho quando o dado existe na loja
 * ativa (ou nas lojas da visão atual). Assim o guia nunca mente, e quem já tem a loja rodando não vê nada. */

export { guideSteps, type GuideStepDefinition, type GuideStepId } from "./steps";

export type GuideExtra = { href: string; title: string; text: string; done: boolean };

export type GuideProgress = {
  steps: (GuideStepDefinition & { done: boolean })[];
  doneCount: number;
  total: number;
  complete: boolean;
  /** Primeiro passo ainda não feito. */
  current: (GuideStepDefinition & { done: boolean }) | null;
  extras: GuideExtra[];
};

/** Só o administrador de um lojista configura o sistema; operador vai direto ao PDV. */
export const guideApplies = (user: { role: string; accountId: string | null }) => user.role === "ADMIN" && Boolean(user.accountId);

/** Lê o que já existe nas lojas da visão atual: a loja ativa, ou todas as do usuário na visão consolidada. */
export async function loadGuideProgress(user: { id: string }): Promise<GuideProgress> {
  const row = (await pool.query<Record<GuideStepId | "team" | "fiscal", boolean>>(`SELECT
    EXISTS(SELECT 1 FROM categories WHERE account_id=app_current_account() AND active) AS category,
    EXISTS(SELECT 1 FROM products p WHERE p.account_id=app_current_account() AND (p.store_id IS NULL OR p.store_id=ANY(app_store_ids()))) AS product,
    EXISTS(SELECT 1 FROM product_stock WHERE store_id=ANY(app_store_ids()) AND quantity>0) AS stock,
    EXISTS(SELECT 1 FROM cash_registers WHERE store_id=ANY(app_store_ids())) AS register,
    EXISTS(SELECT 1 FROM cash_sessions WHERE store_id=ANY(app_store_ids())) AS open,
    EXISTS(SELECT 1 FROM sales WHERE store_id=ANY(app_store_ids())) AS sale,
    EXISTS(SELECT 1 FROM users WHERE account_id=app_current_account() AND id<>$1) AS team,
    EXISTS(SELECT 1 FROM fiscal_invoices WHERE store_id=ANY(app_store_ids())) AS fiscal`, [user.id])).rows[0];
  const steps = guideSteps.map((step) => ({ ...step, done: Boolean(row[step.id]) }));
  const doneCount = steps.filter((step) => step.done).length;
  return {
    steps, doneCount, total: steps.length, complete: doneCount === steps.length, current: steps.find((step) => !step.done) ?? null,
    extras: [
      { href: "/admin/users", title: "Crie o acesso da equipe", text: "Um login para cada operador de caixa, com a loja dele.", done: row.team },
      { href: "/admin/fiscal/integration", title: "Importe uma nota fiscal de compra", text: "Envie o XML do fornecedor e dê entrada no estoque pela nota.", done: row.fiscal },
      { href: "/admin/labels", title: "Imprima etiquetas", text: "Etiquetas com código de barras para os produtos.", done: false },
      { href: "/security", title: "Ative a verificação em duas etapas", text: "Protege o seu acesso de administrador com um código no celular.", done: false },
    ],
  };
}
