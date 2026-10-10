import type { Pool } from "pg";
import type { ParsedOrder, Order } from "./orders.types";
import { withTransaction } from "../../infrastructure/database/transaction";

export async function insertOrdersBatch(
  pool: Pool,
  orders: ParsedOrder[]
): Promise<number> {
  if (orders.length === 0) return 0;

  return withTransaction(pool, async (client) => {
    const values: unknown[] = [];
    const placeholders = orders.map((order, index) => {
      const offset = index * 5;

      values.push(
        order.order_id,
        order.customer_id,
        order.order_date,
        order.order_amount,
        order.status
      );

      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
    });

    const query = `
      INSERT INTO orders (
        order_id,
        customer_id,
        order_date,
        order_amount,
        status
      )
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (order_id) DO NOTHING
    `;

    const result = await client.query(query, values);
    return result.rowCount ?? 0;
  });
}

export async function findOrdersByCustomerId(
  pool: Pool,
  customerId: string,
  limit = 50,
  offset = 0
): Promise<Order[]> {
  const query = `
    SELECT order_id, customer_id, order_date, order_amount, status, created_at
    FROM orders
    WHERE customer_id = $1
    ORDER BY order_date DESC
    LIMIT $2 OFFSET $3
  `;

  const result = await pool.query(query, [customerId, limit, offset]);
  return result.rows;
}

export async function findOrderById(
  pool: Pool,
  orderId: string
): Promise<Order | null> {
  const query = `
    SELECT order_id, customer_id, order_date, order_amount, status, created_at
    FROM orders
    WHERE order_id = $1
    LIMIT 1
  `;

  const result = await pool.query(query, [orderId]);
  return result.rows[0] || null;
}

export async function countOrders(pool: Pool): Promise<number> {
  const result = await pool.query("SELECT COUNT(*)::int as count FROM orders");
  return result.rows[0]?.count ?? 0;
}
