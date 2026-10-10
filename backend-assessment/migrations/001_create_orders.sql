CREATE TABLE IF NOT EXISTS orders (
    order_id UUID PRIMARY KEY,
    customer_id VARCHAR(100) NOT NULL,
    order_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    order_amount NUMERIC(10,2) NOT NULL,
    CHECK (order_amount >= 0),
    status VARCHAR(30) NOT NULL,
    CREATED_AT TIMESTAMP NOT NULL DEFAULT NOW()
    );


CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders (customer_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders (order_date DESC);