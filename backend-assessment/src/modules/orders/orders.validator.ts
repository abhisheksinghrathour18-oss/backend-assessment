
import { z } from "zod";

export const orderSchema = z.object({
  order_id: z.string().uuid(),
  customer_id: z.string().trim().min(1, "customer_id is required"),
  order_date: z.coerce.date(),
  order_amount: z.coerce.number().finite().nonnegative(),
  status: z.string().trim().min(1, "status is required"),
});

export type ValidatedOrder = z.infer<typeof orderSchema>;

export function validateOrder(input: unknown) {
  return orderSchema.safeParse(input);
}
