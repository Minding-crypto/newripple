-- Complete Supabase Setup for Community-Funded Microloan System (Fixed for External Auth)
-- Run this entire script in Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables if they exist (in correct order to handle dependencies)
DROP TABLE IF EXISTS loan_contributions CASCADE;
DROP TABLE IF EXISTS user_reviews CASCADE;
DROP TABLE IF EXISTS microloans CASCADE;
DROP TABLE IF EXISTS locker_bookings CASCADE;
DROP TABLE IF EXISTS admins CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Drop the trigger and function if they exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create profiles table WITHOUT foreign key to auth.users (for external auth)
CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text UNIQUE,
  xrpl_address text,
  rlusd_balance decimal(20,6) DEFAULT 0,
  full_name text,
  bio text,
  profile_picture_url text,
  credibility_score decimal(3,2) DEFAULT 0.00 CHECK (credibility_score >= 0 AND credibility_score <= 5.00),
  total_loans_taken integer DEFAULT 0,
  loans_repaid_on_time integer DEFAULT 0,
  loans_defaulted integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

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
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_microloans_user_id ON microloans(user_id);
CREATE INDEX idx_microloans_status ON microloans(status);
CREATE INDEX idx_microloans_due_date ON microloans(due_date);
CREATE INDEX idx_microloans_funding_deadline ON microloans(funding_deadline);
CREATE INDEX idx_loan_contributions_loan_id ON loan_contributions(loan_id);
CREATE INDEX idx_loan_contributions_funder_id ON loan_contributions(funder_id);
CREATE INDEX idx_user_reviews_reviewed_id ON user_reviews(reviewed_id);
CREATE INDEX idx_profiles_credibility_score ON profiles(credibility_score);

-- Enable Row Level Security (but make policies permissive for external auth)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE microloans ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE locker_bookings ENABLE ROW LEVEL SECURITY;

-- Create permissive RLS Policies (for external auth system)
-- Profiles policies
CREATE POLICY "Allow all operations on profiles" ON profiles USING (true) WITH CHECK (true);

-- Microloans policies
CREATE POLICY "Allow all operations on microloans" ON microloans USING (true) WITH CHECK (true);

-- Loan contributions policies
CREATE POLICY "Allow all operations on loan_contributions" ON loan_contributions USING (true) WITH CHECK (true);

-- User reviews policies
CREATE POLICY "Allow all operations on user_reviews" ON user_reviews USING (true) WITH CHECK (true);

-- Admins policies
CREATE POLICY "Allow all operations on admins" ON admins USING (true) WITH CHECK (true);

-- Locker bookings policies
CREATE POLICY "Allow all operations on locker_bookings" ON locker_bookings USING (true) WITH CHECK (true);

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

-- Function for RLUSD transfers (simplified for external auth)
CREATE OR REPLACE FUNCTION transfer_rlusd(
  sender_id uuid,
  recipient_email text,
  amount decimal(20,6),
  note text DEFAULT null
)
RETURNS void AS $$
DECLARE
  recipient_id uuid;
  sender_balance decimal(20,6);
BEGIN
  -- Get recipient ID
  SELECT id INTO recipient_id
  FROM profiles
  WHERE email = recipient_email;
  
  IF recipient_id IS NULL THEN
    RAISE EXCEPTION 'Recipient not found';
  END IF;

  -- Check sender balance
  SELECT rlusd_balance INTO sender_balance
  FROM profiles
  WHERE id = sender_id;
  
  IF sender_balance < amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Perform transfer
  UPDATE profiles
  SET rlusd_balance = rlusd_balance - amount
  WHERE id = sender_id;
  
  UPDATE profiles
  SET rlusd_balance = rlusd_balance + amount
  WHERE id = recipient_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to fund a loan (works with external auth)
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

-- Function to create or get user profile (helper for external auth)
CREATE OR REPLACE FUNCTION create_or_get_profile(
  user_email text,
  user_name text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  profile_id uuid;
BEGIN
  -- Try to get existing profile
  SELECT id INTO profile_id
  FROM profiles
  WHERE email = user_email;
  
  -- If not found, create new profile
  IF profile_id IS NULL THEN
    INSERT INTO profiles (email, full_name)
    VALUES (user_email, user_name)
    RETURNING id INTO profile_id;
  END IF;
  
  RETURN profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert sample data for testing
INSERT INTO profiles (id, email, full_name, bio, rlusd_balance, credibility_score)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'test@example.com',
  'Test User',
  'Sample user for testing the microloan system',
  1000.00,
  4.5
);

INSERT INTO profiles (id, email, full_name, bio, rlusd_balance, credibility_score)
VALUES (
  '550e8400-e29b-41d4-a716-446655440001',
  'funder@example.com',
  'Community Funder',
  'Sample funder for testing loan funding',
  5000.00,
  4.8
);

-- Show completion message
DO $$
BEGIN
    RAISE NOTICE '=== Community-Funded Microloan System Setup Completed Successfully! ===';
    RAISE NOTICE 'Tables created: profiles, microloans, loan_contributions, user_reviews, admins, locker_bookings';
    RAISE NOTICE 'Functions created: has_outstanding_loan, get_user_loan_stats, transfer_rlusd, fund_loan, update_user_credibility, create_or_get_profile';
    RAISE NOTICE 'Sample users created for testing';
    RAISE NOTICE '=== System is ready for external authentication integration! ===';
END
$$; 