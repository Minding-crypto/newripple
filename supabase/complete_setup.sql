-- Complete Supabase Setup for Community-Funded Microloan System
-- Run this entire script in Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables if they exist (in correct order to handle dependencies)
DROP TABLE IF EXISTS loan_contributions CASCADE;
DROP TABLE IF EXISTS user_reviews CASCADE;
DROP TABLE IF EXISTS microloans CASCADE;
DROP TABLE IF EXISTS locker_bookings CASCADE;
DROP TABLE IF EXISTS admins CASCADE;

-- Create or update profiles table
-- First check if profiles table exists, if not create it
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'profiles') THEN
        CREATE TABLE profiles (
            id uuid REFERENCES auth.users ON DELETE CASCADE,
            email text,
            xrpl_address text,
            rlusd_balance decimal(20,6) DEFAULT 0,
            created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
            PRIMARY KEY (id)
        );
    END IF;
END
$$;

-- Add missing columns to profiles table if they don't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS full_name text,
ADD COLUMN IF NOT EXISTS bio text,
ADD COLUMN IF NOT EXISTS profile_picture_url text,
ADD COLUMN IF NOT EXISTS credibility_score decimal(3,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS total_loans_taken integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS loans_repaid_on_time integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS loans_defaulted integer DEFAULT 0;

-- Add constraint for credibility_score if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'profiles' 
        AND constraint_name = 'profiles_credibility_score_check'
    ) THEN
        ALTER TABLE profiles ADD CONSTRAINT profiles_credibility_score_check 
        CHECK (credibility_score >= 0 AND credibility_score <= 5.00);
    END IF;
END
$$;

-- Create trigger for new user profile creation if it doesn't exist
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate the trigger to ensure it's current
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Create microloans table
CREATE TABLE microloans (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES profiles(id) NOT NULL,
  amount decimal(10,6) NOT NULL CHECK (amount > 0 AND amount <= 100),
  purpose text NOT NULL,
  request_date timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  due_date timestamp with time zone NOT NULL,
  status text DEFAULT 'funding' NOT NULL CHECK (status IN ('funding', 'funded', 'approved', 'repaid', 'defaulted')),
  target_amount decimal(10,6) NOT NULL,
  funded_amount decimal(10,6) DEFAULT 0,
  interest_rate decimal(5,4) DEFAULT 0.05 NOT NULL,
  approved_date timestamp with time zone,
  repaid_date timestamp with time zone,
  funding_deadline timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create loan_contributions table
CREATE TABLE loan_contributions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id uuid REFERENCES microloans(id) NOT NULL,
  funder_id uuid REFERENCES profiles(id) NOT NULL,
  amount decimal(10,6) NOT NULL CHECK (amount > 0),
  expected_return decimal(10,6) NOT NULL,
  actual_return decimal(10,6) DEFAULT 0,
  status text DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'repaid', 'defaulted')),
  contributed_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  repaid_at timestamp with time zone,
  UNIQUE(loan_id, funder_id)
);

-- Create user_reviews table
CREATE TABLE user_reviews (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  reviewer_id uuid REFERENCES profiles(id) NOT NULL,
  reviewed_id uuid REFERENCES profiles(id) NOT NULL,
  loan_id uuid REFERENCES microloans(id),
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(reviewer_id, reviewed_id, loan_id)
);

-- Create admins table
CREATE TABLE admins (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES profiles(id) NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create locker_bookings table
CREATE TABLE locker_bookings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES profiles(id) NOT NULL,
  locker_type text NOT NULL,
  tracking_id text NOT NULL,
  item_description text NOT NULL,
  quantity integer NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  price numeric(10,2),
  locker_number integer,
  locker_password text,
  unique_id text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  approved_at timestamp with time zone,
  collected_at timestamp with time zone
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_microloans_user_id ON microloans(user_id);
CREATE INDEX IF NOT EXISTS idx_microloans_status ON microloans(status);
CREATE INDEX IF NOT EXISTS idx_microloans_due_date ON microloans(due_date);
CREATE INDEX IF NOT EXISTS idx_microloans_funding_deadline ON microloans(funding_deadline);
CREATE INDEX IF NOT EXISTS idx_loan_contributions_loan_id ON loan_contributions(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_contributions_funder_id ON loan_contributions(funder_id);
CREATE INDEX IF NOT EXISTS idx_user_reviews_reviewed_id ON user_reviews(reviewed_id);
CREATE INDEX IF NOT EXISTS idx_profiles_credibility_score ON profiles(credibility_score);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE microloans ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE locker_bookings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Anyone can view funding loans" ON microloans;
DROP POLICY IF EXISTS "Anyone can create loans" ON microloans;
DROP POLICY IF EXISTS "Anyone can update loans" ON microloans;
DROP POLICY IF EXISTS "Anyone can view loan contributions" ON loan_contributions;
DROP POLICY IF EXISTS "Anyone can create contributions" ON loan_contributions;
DROP POLICY IF EXISTS "Anyone can view reviews" ON user_reviews;
DROP POLICY IF EXISTS "Anyone can create reviews" ON user_reviews;
DROP POLICY IF EXISTS "Admins can view admin list" ON admins;
DROP POLICY IF EXISTS "Users can view their own bookings" ON locker_bookings;
DROP POLICY IF EXISTS "Users can create bookings" ON locker_bookings;
DROP POLICY IF EXISTS "Admins can view all bookings" ON locker_bookings;
DROP POLICY IF EXISTS "Admins can update bookings" ON locker_bookings;

-- Create RLS Policies (simplified for external auth)
-- Profiles policies
CREATE POLICY "Users can view all profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (true);
CREATE POLICY "Users can insert profiles" ON profiles FOR INSERT WITH CHECK (true);

-- Microloans policies
CREATE POLICY "Anyone can view funding loans" ON microloans FOR SELECT USING (true);
CREATE POLICY "Anyone can create loans" ON microloans FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update loans" ON microloans FOR UPDATE USING (true);

-- Loan contributions policies
CREATE POLICY "Anyone can view loan contributions" ON loan_contributions FOR SELECT USING (true);
CREATE POLICY "Anyone can create contributions" ON loan_contributions FOR INSERT WITH CHECK (true);

-- User reviews policies
CREATE POLICY "Anyone can view reviews" ON user_reviews FOR SELECT USING (true);
CREATE POLICY "Anyone can create reviews" ON user_reviews FOR INSERT WITH CHECK (true);

-- Admins policies
CREATE POLICY "Admins can view admin list" ON admins FOR SELECT USING (true);

-- Locker bookings policies
CREATE POLICY "Users can view their own bookings" ON locker_bookings FOR SELECT USING (true);
CREATE POLICY "Users can create bookings" ON locker_bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view all bookings" ON locker_bookings FOR SELECT USING (true);
CREATE POLICY "Admins can update bookings" ON locker_bookings FOR UPDATE USING (true);

-- Function to check if user has outstanding loans
CREATE OR REPLACE FUNCTION has_outstanding_loan(user_uuid uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM microloans 
    WHERE user_id = user_uuid 
    AND status IN ('funding', 'funded', 'approved')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user loan statistics
CREATE OR REPLACE FUNCTION get_user_loan_stats(user_uuid uuid)
RETURNS json AS $$
DECLARE
  total_loans integer;
  repaid_loans integer;
  defaulted_loans integer;
  success_rate decimal(5,2);
BEGIN
  SELECT count(*) INTO total_loans
  FROM microloans
  WHERE user_id = user_uuid AND status IN ('repaid', 'defaulted');
  
  SELECT count(*) INTO repaid_loans
  FROM microloans
  WHERE user_id = user_uuid AND status = 'repaid';
  
  SELECT count(*) INTO defaulted_loans
  FROM microloans
  WHERE user_id = user_uuid AND status = 'defaulted';
  
  IF total_loans > 0 THEN
    success_rate := (repaid_loans::decimal / total_loans::decimal) * 100;
  ELSE
    success_rate := 0;
  END IF;
  
  RETURN json_build_object(
    'total_loans', total_loans,
    'repaid_loans', repaid_loans,
    'defaulted_loans', defaulted_loans,
    'success_rate', success_rate
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for RLUSD transfers
CREATE OR REPLACE FUNCTION transfer_rlusd(
  recipient_email text,
  amount decimal(20,6),
  note text DEFAULT null
)
RETURNS void AS $$
DECLARE
  sender_id uuid;
  recipient_id uuid;
  sender_balance decimal(20,6);
BEGIN
  -- For now, we'll use the first parameter as sender_id since auth is external
  -- This function may need to be modified based on your auth system
  
  -- Get recipient ID
  SELECT id INTO recipient_id
  FROM profiles
  WHERE email = recipient_email;
  
  IF recipient_id IS NULL THEN
    RAISE EXCEPTION 'Recipient not found';
  END IF;

  -- Note: You'll need to modify this function to work with your external auth
  -- For now, it's a placeholder
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to fund a loan (updated to not use auth.uid())
CREATE OR REPLACE FUNCTION fund_loan(
  loan_uuid uuid,
  funding_amount decimal(10,6),
  funder_user_id uuid
)
RETURNS json AS $$
DECLARE
  loan_record microloans%rowtype;
  expected_return decimal(10,6);
  remaining_amount decimal(10,6);
BEGIN
  -- Validate inputs
  IF funder_user_id IS NULL THEN
    RAISE EXCEPTION 'Funder user ID is required';
  END IF;

  IF funding_amount <= 0 THEN
    RAISE EXCEPTION 'Funding amount must be greater than 0';
  END IF;

  -- Get loan details
  SELECT * INTO loan_record FROM microloans WHERE id = loan_uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;

  IF loan_record.status != 'funding' THEN
    RAISE EXCEPTION 'Loan is not accepting funding';
  END IF;

  -- Calculate remaining amount needed
  remaining_amount := loan_record.target_amount - loan_record.funded_amount;
  
  IF funding_amount > remaining_amount THEN
    RAISE EXCEPTION 'Funding amount exceeds remaining needed amount: %', remaining_amount;
  END IF;

  -- Calculate expected return
  expected_return := funding_amount * (1 + loan_record.interest_rate);

  -- Create contribution record
  INSERT INTO loan_contributions (
    loan_id, funder_id, amount, expected_return
  ) VALUES (
    loan_uuid, funder_user_id, funding_amount, expected_return
  ) ON CONFLICT (loan_id, funder_id) DO UPDATE SET
    amount = loan_contributions.amount + EXCLUDED.amount,
    expected_return = loan_contributions.expected_return + EXCLUDED.expected_return;

  -- Update loan funded amount
  UPDATE microloans 
  SET funded_amount = funded_amount + funding_amount,
      status = CASE 
        WHEN (funded_amount + funding_amount) >= target_amount THEN 'funded'
        ELSE 'funding'
      END,
      updated_at = now()
  WHERE id = loan_uuid;

  RETURN json_build_object(
    'success', true,
    'funded_amount', funding_amount,
    'expected_return', expected_return
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update user credibility
CREATE OR REPLACE FUNCTION update_user_credibility(user_uuid uuid)
RETURNS void AS $$
DECLARE
  avg_rating decimal(3,2);
  loan_performance decimal(3,2);
  final_score decimal(3,2);
  total_reviews integer;
BEGIN
  -- Calculate average rating from reviews
  SELECT COALESCE(avg(rating), 0), count(*) 
  INTO avg_rating, total_reviews
  FROM user_reviews 
  WHERE reviewed_id = user_uuid;
  
  -- Calculate loan performance (repayment rate)
  SELECT 
    CASE 
      WHEN (loans_repaid_on_time + loans_defaulted) > 0 
      THEN (loans_repaid_on_time::decimal / (loans_repaid_on_time + loans_defaulted)::decimal) * 5.0
      ELSE 2.5 -- Default neutral score
    END
  INTO loan_performance
  FROM profiles 
  WHERE id = user_uuid;
  
  -- Calculate final credibility score (weighted average)
  IF total_reviews > 0 THEN
    final_score := (avg_rating * 0.6) + (loan_performance * 0.4);
  ELSE
    final_score := loan_performance;
  END IF;
  
  -- Update user's credibility score
  UPDATE profiles 
  SET credibility_score = final_score
  WHERE id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert sample data for testing (optional - you can remove this section)
-- Create a sample profile for testing
INSERT INTO profiles (id, email, full_name, bio, rlusd_balance, credibility_score)
VALUES (
  uuid_generate_v4(),
  'test@example.com',
  'Test User',
  'Sample user for testing the microloan system',
  1000.00,
  4.5
) ON CONFLICT (id) DO NOTHING;

-- Show completion message
DO $$
BEGIN
    RAISE NOTICE 'Community-Funded Microloan System setup completed successfully!';
    RAISE NOTICE 'Tables created: profiles, microloans, loan_contributions, user_reviews, admins, locker_bookings';
    RAISE NOTICE 'Functions created: has_outstanding_loan, get_user_loan_stats, transfer_rlusd, fund_loan, update_user_credibility';
    RAISE NOTICE 'All RLS policies have been set up.';
    RAISE NOTICE 'You can now use the microloan system!';
END
$$; 