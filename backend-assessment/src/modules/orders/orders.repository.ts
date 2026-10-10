
import type { Pool } from "pg";
import type { ParsedOrder } from "./orders.parser";
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
