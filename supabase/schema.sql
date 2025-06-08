-- Create profiles table for user information
create table profiles (
  id uuid references auth.users on delete cascade,
  email text,
  xrpl_address text,
  rlusd_balance decimal(20,6) default 0,
  full_name text,
  bio text,
  profile_picture_url text,
  credibility_score decimal(3,2) default 0.00 check (credibility_score >= 0 and credibility_score <= 5.00),
  total_loans_taken integer default 0,
  loans_repaid_on_time integer default 0,
  loans_defaulted integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (id)
);

-- Create trigger to create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Create microloans table
create table microloans (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id) not null,
  amount decimal(10,6) not null check (amount > 0 and amount <= 100),
  purpose text not null,
  request_date timestamp with time zone default timezone('utc'::text, now()) not null,
  due_date timestamp with time zone not null,
  status text default 'funding' not null check (status in ('funding', 'funded', 'approved', 'repaid', 'defaulted')),
  target_amount decimal(10,6) not null,
  funded_amount decimal(10,6) default 0,
  interest_rate decimal(5,4) default 0.05 not null, -- 5% default
  approved_date timestamp with time zone,
  repaid_date timestamp with time zone,
  funding_deadline timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create loan_contributions table for community funding
create table loan_contributions (
  id uuid primary key default uuid_generate_v4(),
  loan_id uuid references microloans not null,
  funder_id uuid references profiles(id) not null,
  amount decimal(10,6) not null check (amount > 0),
  expected_return decimal(10,6) not null,
  actual_return decimal(10,6) default 0,
  status text default 'active' not null check (status in ('active', 'repaid', 'defaulted')),
  contributed_at timestamp with time zone default timezone('utc'::text, now()) not null,
  repaid_at timestamp with time zone,
  unique(loan_id, funder_id)
);

-- Create user_reviews table for credibility system
create table user_reviews (
  id uuid primary key default uuid_generate_v4(),
  reviewer_id uuid references profiles(id) not null,
  reviewed_id uuid references profiles(id) not null,
  loan_id uuid references microloans,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(reviewer_id, reviewed_id, loan_id)
);

-- Create admins table
create table admins (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create locker_bookings table
create table locker_bookings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id) not null,
  locker_type text not null,
  tracking_id text not null,
  item_description text not null,
  quantity integer not null,
  status text default 'pending' not null,
  price numeric(10,2),
  locker_number integer,
  locker_password text,
  unique_id text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  approved_at timestamp with time zone,
  collected_at timestamp with time zone
);

-- Create indexes
create index idx_microloans_user_id on microloans(user_id);
create index idx_microloans_status on microloans(status);
create index idx_microloans_due_date on microloans(due_date);
create index idx_microloans_funding_deadline on microloans(funding_deadline);
create index idx_loan_contributions_loan_id on loan_contributions(loan_id);
create index idx_loan_contributions_funder_id on loan_contributions(funder_id);
create index idx_user_reviews_reviewed_id on user_reviews(reviewed_id);
create index idx_profiles_credibility_score on profiles(credibility_score);

-- Create RLS policies
alter table profiles enable row level security;
alter table microloans enable row level security;
alter table loan_contributions enable row level security;
alter table user_reviews enable row level security;
alter table admins enable row level security;
alter table locker_bookings enable row level security;

-- Profiles policies
create policy "Users can view all profiles"
  on profiles for select
  using ( true );

create policy "Users can update their own profile"
  on profiles for update
  using ( auth.uid() = id );

-- Microloans policies
create policy "Anyone can view funding loans"
  on microloans for select
  using ( true );

create policy "Users can create their own loans"
  on microloans for insert
  with check ( auth.uid() = user_id );

create policy "Users can update their own loans"
  on microloans for update
  using ( auth.uid() = user_id );

-- Loan contributions policies
create policy "Anyone can view loan contributions"
  on loan_contributions for select
  using ( true );

create policy "Users can create contributions"
  on loan_contributions for insert
  with check ( auth.uid() = funder_id );

create policy "Users can view their own contributions"
  on loan_contributions for select
  using ( auth.uid() = funder_id );

-- User reviews policies
create policy "Anyone can view reviews"
  on user_reviews for select
  using ( true );

create policy "Users can create reviews"
  on user_reviews for insert
  with check ( auth.uid() = reviewer_id );

-- Admins policies
create policy "Admins can view admin list"
  on admins for select
  using ( auth.uid() in ( select user_id from admins ) );

-- Locker bookings policies
create policy "Users can view their own bookings"
  on locker_bookings for select
  using ( auth.uid() = user_id );

create policy "Users can create bookings"
  on locker_bookings for insert
  with check ( auth.uid() = user_id );

create policy "Admins can view all bookings"
  on locker_bookings for select
  using ( auth.uid() in ( select user_id from admins ) );

create policy "Admins can update bookings"
  on locker_bookings for update
  using ( auth.uid() in ( select user_id from admins ) );

-- Function for RLUSD transfers
create or replace function transfer_rlusd(
  recipient_email text,
  amount decimal(20,6),
  note text default null
)
returns void as $$
declare
  sender_id uuid;
  recipient_id uuid;
  sender_balance decimal(20,6);
begin
  -- Get sender ID
  sender_id := auth.uid();
  if sender_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Get recipient ID
  select id into recipient_id
  from profiles
  where email = recipient_email;
  
  if recipient_id is null then
    raise exception 'Recipient not found';
  end if;

  -- Check sender balance
  select rlusd_balance into sender_balance
  from profiles
  where id = sender_id;
  
  if sender_balance < amount then
    raise exception 'Insufficient balance';
  end if;

  -- Perform transfer
  update profiles
  set rlusd_balance = rlusd_balance - amount
  where id = sender_id;
  
  update profiles
  set rlusd_balance = rlusd_balance + amount
  where id = recipient_id;
end;
$$ language plpgsql security definer;

-- Function to check if user has outstanding loans
create or replace function has_outstanding_loan(user_uuid uuid)
returns boolean as $$
begin
  return exists(
    select 1 from microloans 
    where user_id = user_uuid 
    and status in ('funding', 'funded', 'approved')
  );
end;
$$ language plpgsql security definer;

-- Function to get user loan statistics
create or replace function get_user_loan_stats(user_uuid uuid)
returns json as $$
declare
  total_loans integer;
  repaid_loans integer;
  defaulted_loans integer;
  success_rate decimal(5,2);
begin
  select count(*) into total_loans
  from microloans
  where user_id = user_uuid and status in ('repaid', 'defaulted');
  
  select count(*) into repaid_loans
  from microloans
  where user_id = user_uuid and status = 'repaid';
  
  select count(*) into defaulted_loans
  from microloans
  where user_id = user_uuid and status = 'defaulted';
  
  if total_loans > 0 then
    success_rate := (repaid_loans::decimal / total_loans::decimal) * 100;
  else
    success_rate := 0;
  end if;
  
  return json_build_object(
    'total_loans', total_loans,
    'repaid_loans', repaid_loans,
    'defaulted_loans', defaulted_loans,
    'success_rate', success_rate
  );
end;
$$ language plpgsql security definer;

-- Function to fund a loan
create or replace function fund_loan(
  loan_uuid uuid,
  funding_amount decimal(10,6),
  funder_user_id uuid
)
returns json as $$
declare
  loan_record microloans%rowtype;
  expected_return decimal(10,6);
  remaining_amount decimal(10,6);
begin
  -- Use provided funder_user_id instead of auth.uid()
  if funder_user_id is null then
    raise exception 'Funder user ID is required';
  end if;

  -- Get loan details
  select * into loan_record from microloans where id = loan_uuid;
  if not found then
    raise exception 'Loan not found';
  end if;

  if loan_record.status != 'funding' then
    raise exception 'Loan is not accepting funding';
  end if;

  -- Calculate remaining amount needed
  remaining_amount := loan_record.target_amount - loan_record.funded_amount;
  
  if funding_amount > remaining_amount then
    raise exception 'Funding amount exceeds remaining needed amount';
  end if;

  -- Calculate expected return
  expected_return := funding_amount * (1 + loan_record.interest_rate);

  -- Create contribution record
  insert into loan_contributions (
    loan_id, funder_id, amount, expected_return
  ) values (
    loan_uuid, funder_user_id, funding_amount, expected_return
  ) on conflict (loan_id, funder_id) do update set
    amount = loan_contributions.amount + excluded.amount,
    expected_return = loan_contributions.expected_return + excluded.expected_return;

  -- Update loan funded amount
  update microloans 
  set funded_amount = funded_amount + funding_amount,
      status = case 
        when (funded_amount + funding_amount) >= target_amount then 'funded'
        else 'funding'
      end,
      updated_at = now()
  where id = loan_uuid;

  return json_build_object(
    'success', true,
    'funded_amount', funding_amount,
    'expected_return', expected_return
  );
end;
$$ language plpgsql security definer;

-- Function to update user credibility
create or replace function update_user_credibility(user_uuid uuid)
returns void as $$
declare
  avg_rating decimal(3,2);
  loan_performance decimal(3,2);
  final_score decimal(3,2);
  total_reviews integer;
begin
  -- Calculate average rating from reviews
  select coalesce(avg(rating), 0), count(*) 
  into avg_rating, total_reviews
  from user_reviews 
  where reviewed_id = user_uuid;
  
  -- Calculate loan performance (repayment rate)
  select 
    case 
      when (loans_repaid_on_time + loans_defaulted) > 0 
      then (loans_repaid_on_time::decimal / (loans_repaid_on_time + loans_defaulted)::decimal) * 5.0
      else 2.5 -- Default neutral score
    end
  into loan_performance
  from profiles 
  where id = user_uuid;
  
  -- Calculate final credibility score (weighted average)
  if total_reviews > 0 then
    final_score := (avg_rating * 0.6) + (loan_performance * 0.4);
  else
    final_score := loan_performance;
  end if;
  
  -- Update user's credibility score
  update profiles 
  set credibility_score = final_score
  where id = user_uuid;
end;
$$ language plpgsql security definer; 