create table if not exists users (
  wallet_address text primary key,
  username text,
  avatar text,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  on_chain_task_id text primary key,
  creator_wallet text not null,
  title text not null,
  description text not null,
  category text not null,
  metadata_uri text,
  created_at timestamptz not null default now()
);

create index if not exists tasks_category_idx on tasks (category);
create index if not exists tasks_creator_idx on tasks (creator_wallet);

create table if not exists submissions (
  id serial primary key,
  on_chain_submission_id text,
  task_id text not null,
  contributor_wallet text not null,
  submission_uri text,
  created_at timestamptz not null default now()
);

create index if not exists submissions_task_idx on submissions (task_id);

create table if not exists transactions (
  signature text primary key,
  transaction_type text not null,
  wallet_address text not null,
  task_id text,
  created_at timestamptz not null default now()
);

create index if not exists transactions_wallet_idx on transactions (wallet_address);
