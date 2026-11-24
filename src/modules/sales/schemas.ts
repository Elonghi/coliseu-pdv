import { z } from "zod";

export const checkoutSchema = z.object({
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(9999), discountBasisPoints: z.number().int().min(0).max(10_000) })).min(1).max(100),
  payments: z.array(z.object({
    methodCode: z.string().min(1).max(30), amountAppliedCents: z.number().int().positive(), amountReceivedCents: z.number().int().positive().optional(),
    playerId: z.string().uuid().optional(), dueDate: z.string().date().optional(),
  })).min(1).max(6),
  /** Venda que cobra uma comanda: o carrinho tem de ser exatamente a conta dela, e a comanda é encerrada junto com a venda. */
  comandaSessionId: z.string().uuid().optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export const cancelSaleSchema = z.object({ reason: z.string().trim().min(5).max(500) });
