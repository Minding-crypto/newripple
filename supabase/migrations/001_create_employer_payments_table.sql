CREATE TABLE IF NOT EXISTS employer_payments (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    employer_id UUID REFERENCES auth.users(id),
    employee_wallet_address TEXT NOT NULL,
    fiat_amount DECIMAL(18, 8) NOT NULL,
    fiat_currency VARCHAR(3) NOT NULL,
    xrp_amount DECIMAL(18, 8) NOT NULL,
    exchange_rate DECIMAL(18, 8) NOT NULL,
    stripe_payment_id TEXT UNIQUE,
    status TEXT CHECK (status IN ('pending', 'completed', 'failed')) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
); 