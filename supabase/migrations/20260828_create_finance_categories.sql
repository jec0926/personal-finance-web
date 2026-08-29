create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  parent_id uuid null references public.finance_categories(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 80),
  sort_order integer not null default 100 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists finance_categories_root_name_unique
  on public.finance_categories (user_id, lower(name))
  where parent_id is null;

create unique index if not exists finance_categories_child_name_unique
  on public.finance_categories (user_id, parent_id, lower(name))
  where parent_id is not null;

create index if not exists finance_categories_user_parent_sort_idx
  on public.finance_categories (user_id, parent_id, sort_order, name);

alter table public.finance_categories enable row level security;

-- 이 앱의 서버 API는 Secret Key를 사용하며 모든 쿼리에 user_id를 강제한다.
-- 브라우저에서 직접 접근할 수 있는 anon/authenticated 정책은 의도적으로 만들지 않는다.

