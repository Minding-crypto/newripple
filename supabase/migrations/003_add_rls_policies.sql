-- Enable RLS on the employer_payments table
ALTER TABLE public.employer_payments ENABLE ROW LEVEL SECURITY;

-- Allow employers to see their own payments
CREATE POLICY "Allow employers to see their own payments"
ON public.employer_payments
FOR SELECT
USING (auth.uid() = employer_id);

-- Allow service role to perform all actions (for edge functions)
CREATE POLICY "Allow service role full access"
ON public.employer_payments
FOR ALL
USING (true)
WITH CHECK (true);


-- Enable RLS on the exchange_rate_history table
ALTER TABLE public.exchange_rate_history ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read exchange rate history
CREATE POLICY "Allow authenticated read access to exchange rate history"
ON public.exchange_rate_history
FOR SELECT
USING (auth.role() = 'authenticated');

-- Allow service role to perform all actions
CREATE POLICY "Allow service role full access on exchange rate history"
ON public.exchange_rate_history
FOR ALL
USING (true)
WITH CHECK (true); 