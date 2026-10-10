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
    const result = validateOrder(validOrder);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.order_amount).toBe(1500.5);
      expect(result.data.order_date).toBeInstanceOf(Date);
    }
  });

  it("rejects an invalid UUID", () => {
    expect(
      validateOrder({ ...validOrder, order_id: "invalid-id" }).success,
    ).toBe(false);
  });

  it("rejects a negative order amount", () => {
    expect(
      validateOrder({ ...validOrder, order_amount: "-100" }).success,
    ).toBe(false);
  });

  it("rejects non-numeric order amount", () => {
    expect(
      validateOrder({ ...validOrder, order_amount: "not-a-number" }).success,
    ).toBe(false);
  });

  it("rejects an empty order amount", () => {
    expect(
      validateOrder({ ...validOrder, order_amount: "" }).success,
    ).toBe(false);
  });

  it("rejects a missing customer ID", () => {
    expect(
      validateOrder({ ...validOrder, customer_id: "" }).success,
    ).toBe(false);
  });

  it("rejects a whitespace-only customer ID", () => {
    expect(
      validateOrder({ ...validOrder, customer_id: "   " }).success,
    ).toBe(false);
  });

  it("rejects an invalid date format", () => {
    expect(
      validateOrder({ ...validOrder, order_date: "invalid-date" }).success,
    ).toBe(false);
  });

  it("rejects an empty order date", () => {
    expect(
      validateOrder({ ...validOrder, order_date: "" }).success,
    ).toBe(false);
  });

  it("rejects an empty status", () => {
    expect(
      validateOrder({ ...validOrder, status: "" }).success,
    ).toBe(false);
  });
});
