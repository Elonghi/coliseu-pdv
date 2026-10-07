import { z } from "zod";

export const checkoutSchema = z.object({
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(9999), discountBasisPoints: z.number().int().min(0).max(10_000) })).min(1).max(100),
  payments: z.array(z.object({ methodCode: z.string().min(1).max(30), amountAppliedCents: z.number().int().positive(), amountReceivedCents: z.number().int().positive().optional() })).min(1).max(4),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export const cancelSaleSchema = z.object({ reason: z.string().trim().min(5).max(500) });
