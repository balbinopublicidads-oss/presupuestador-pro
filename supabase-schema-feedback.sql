-- Presupuestador Pro — Feedback de usuarios (widget flotante 💡)
-- Pegar en Supabase > SQL Editor > Run

create table feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  page text,
  created_at timestamptz not null default now()
);

alter table feedback enable row level security;

-- Cada usuario puede mandar y ver su propio feedback (no el de otros)
create policy "feedback: owner insert" on feedback
  for insert with check (auth.uid() = user_id);
create policy "feedback: owner select" on feedback
  for select using (auth.uid() = user_id);

create index feedback_user_id_idx on feedback(user_id);
create index feedback_created_at_idx on feedback(created_at desc);
