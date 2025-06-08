ALTER TABLE public.employer_payments
RENAME COLUMN stripe_payment_id TO transaction_hash;

ALTER TABLE public.employer_payments
ADD COLUMN stripe_payment_intent_id TEXT; 