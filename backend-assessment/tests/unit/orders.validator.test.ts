
import { describe, it, expect } from "vitest";
import { validateOrder } from "../../src/modules/orders/orders.validator";

const validOrder = {
  order_id: "550e8400-e29b-41d4-a716-446655440000",
  customer_id: "customer-123",
  order_date: "2026-10-10",
  order_amount: "1500.50",
  status: "pending",
};

describe("validateOrder", () => {
  it("accepts a valid order", () => {
    expect(validateOrder(validOrder).success).toBe(true);
  });

  it("rejects an invalid UUID", () => {
    expect(
      validateOrder({ ...validOrder, order_id: "invalid-id" }).success
    ).toBe(false);
  });

  it("rejects a negative order amount", () => {
    expect(
      validateOrder({ ...validOrder, order_amount: "-100" }).success
    ).toBe(false);
  });

  it("rejects a missing customer ID", () => {
    expect(
      validateOrder({ ...validOrder, customer_id: "" }).success
    ).toBe(false);
  });
});

