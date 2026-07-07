-- Presupuestador Pro — Fase 2: Suscripciones y planes (Mercado Pago)
-- Pegar esto en Supabase > SQL Editor > New query > Run
-- (se ejecuta DESPUÉS de supabase-schema.sql, que ya debería estar corrido)

-- ---- Extensiones necesarias para llamar a la API de Mercado Pago desde la base ----
-- Si "pg_cron" o "pg_net" dan error de permisos acá, andá a Database > Extensions
-- en el panel de Supabase y activalas ahí con el toggle (buscá "pg_cron" y "pg_net").
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---- Guardar el Access Token de Mercado Pago de forma segura (no queda expuesto por la API) ----
-- (ya ejecutado — el token real vive en Supabase Vault, no en este archivo. Si tenés que
-- volver a correr esto en otro proyecto, reemplazá el placeholder por el Access Token real)
select vault.create_secret(
  'REDACTED-YA-CARGADO-EN-VAULT',
  'mp_access_token',
  'Mercado Pago Access Token'
);

-- ---- Suscripciones (1 por usuario) ----
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  plan text not null default 'free', -- 'free' | 'founder' | 'pro'
  status text not null default 'inactive', -- 'inactive' | 'pending' | 'authorized' | 'paused' | 'cancelled'
  mp_preapproval_id text,
  founder_number integer,
  founder_started_at timestamptz,
  current_price numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table subscriptions enable row level security;
create policy "subscriptions: owner read" on subscriptions for select using (auth.uid() = user_id);
-- No hay política de insert/update/delete para el cliente: solo las funciones de servidor
-- (SECURITY DEFINER) o el webhook (service_role) pueden modificar esta tabla.

-- ---- Contador atómico de cupos founders (fila única, evita condiciones de carrera) ----
create table founder_counter (
  id boolean primary key default true,
  taken integer not null default 0,
  constraint singleton check (id)
);
insert into founder_counter (taken) values (0);
alter table founder_counter enable row level security;
create policy "founder_counter: public read" on founder_counter for select using (true);
-- Sin política de escritura: solo la función try_assign_founder_slot (dueña: postgres) puede escribir.

create or replace function try_assign_founder_slot(p_user_id uuid) returns integer
language plpgsql security definer as $$
declare v_num integer;
begin
  update founder_counter set taken = taken + 1 where taken < 30 returning taken into v_num;
  if v_num is null then return null; end if;
  update subscriptions
    set founder_number = v_num, founder_started_at = now(), plan = 'founder', current_price = 3990
    where user_id = p_user_id;
  return v_num;
end;
$$;

-- ---- Crear automáticamente una suscripción "free" al crear el negocio ----
create or replace function create_default_subscription() returns trigger
language plpgsql security definer as $$
begin
  insert into subscriptions (user_id, plan, status) values (new.user_id, 'free', 'inactive')
  on conflict (user_id) do nothing;
  return new;
end;
$$;
create trigger businesses_after_insert_sub after insert on businesses
for each row execute function create_default_subscription();

-- Backfill: por si ya hay negocios creados antes de esta migración
insert into subscriptions (user_id, plan, status)
select user_id, 'free', 'inactive' from businesses
on conflict (user_id) do nothing;

-- ---- Límite de 3 presupuestos/mes en plan free ----
create or replace function enforce_quote_quota() returns trigger
language plpgsql security definer as $$
declare v_plan text; v_count integer;
begin
  select plan into v_plan from subscriptions where user_id = new.user_id;
  if v_plan is null or v_plan = 'free' then
    select count(*) into v_count from quotes
      where user_id = new.user_id and created_at >= date_trunc('month', now());
    if v_count >= 3 then
      raise exception 'FREE_PLAN_LIMIT_REACHED';
    end if;
  end if;
  return new;
end;
$$;
create trigger quotes_quota_check before insert on quotes
for each row execute function enforce_quote_quota();

-- ---- Tarea diaria: sube el precio de founders de $3990 a $7990 tras 3 meses ----
create or replace function bump_founder_prices() returns void
language plpgsql security definer as $$
declare v_token text; r record;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'mp_access_token';
  for r in
    select * from subscriptions
    where plan = 'founder' and current_price = 3990
      and founder_started_at <= now() - interval '3 months'
      and mp_preapproval_id is not null
  loop
    perform net.http_put(
      url := 'https://api.mercadopago.com/preapproval/' || r.mp_preapproval_id,
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_token, 'Content-Type', 'application/json'),
      body := jsonb_build_object('auto_recurring', jsonb_build_object('transaction_amount', 7990))
    );
    update subscriptions set current_price = 7990, updated_at = now() where id = r.id;
  end loop;
end;
$$;

select cron.schedule('bump-founder-prices-daily', '0 6 * * *', 'select bump_founder_prices()');
