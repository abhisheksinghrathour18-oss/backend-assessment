import { z } from "zod";

export const orderSchema = z.object({
  order_id: z
    .string()
    .trim()
    .uuid("order_id must be a valid UUID"),

  customer_id: z
    .string()
    .trim()
    .min(1, "customer_id is required")
    .max(100, "customer_id must not exceed 100 characters"),

  order_date: z.preprocess((val) => {
    if (val === "" || val === null || val === undefined) return undefined;
    if (typeof val === "string" && val.trim() === "") return undefined;
    return val;
  }, z.coerce.date({ message: "order_date must be a valid date" })),

  order_amount: z.preprocess((val) => {
    if (val === "" || val === null || val === undefined) return undefined;
    if (typeof val === "string" && val.trim() === "") return undefined;
    const num = Number(val);
    return isNaN(num) ? val : num;
  }, z.number({ message: "order_amount must be a valid number" })
    .finite("order_amount must be a finite number")
    .nonnegative("order_amount must be non-negative")),

  status: z
    .string()
    .trim()
    .min(1, "status is required")
    .max(30, "status must not exceed 30 characters"),
});

export type ValidatedOrder = z.infer<typeof orderSchema>;

export function validateOrder(input: unknown) {
  return orderSchema.safeParse(input);
}
