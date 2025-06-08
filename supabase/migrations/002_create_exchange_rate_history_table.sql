CREATE TABLE IF NOT EXISTS exchange_rate_history (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    from_currency VARCHAR(10) NOT NULL,
    to_currency VARCHAR(10) NOT NULL,
    rate DECIMAL(18, 8) NOT NULL,
    source VARCHAR(50),
    timestamp TIMESTAMPTZ DEFAULT NOW()
); 