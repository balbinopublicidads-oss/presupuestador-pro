-- ════════════════════════════════════════════════════════════
-- FASE 1 — Estado del presupuesto + aprobación del cliente
-- Pegar en Supabase > SQL Editor > Run (ejecutar TODO junto)
-- ════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. Nueva columna work_status (ciclo del TRABAJO)
--    Se agrega ahora, aunque su interfaz llega en la Fase 2,
--    para no perder los datos de los estados 'en_ejecucion' y
--    'cobrado' que hoy viven mezclados en la columna status.
-- ---------------------------------------------------------------
alter table quotes add column if not exists work_status text not null default 'pendiente';

update quotes set work_status = 'en_ejecucion' where status = 'en_ejecucion';
update quotes set work_status = 'cobrado'      where status = 'cobrado';

-- ---------------------------------------------------------------
-- 2. Migrar status al ciclo del PRESUPUESTO
--    pendiente              -> enviado
--    aceptado               -> aprobado
--    en_ejecucion / cobrado -> aprobado (el detalle ya quedó en work_status)
--    rechazado              -> rechazado (sin cambio)
-- ---------------------------------------------------------------
update quotes set status = 'enviado'  where status = 'pendiente';
update quotes set status = 'aprobado' where status in ('aceptado', 'en_ejecucion', 'cobrado');

alter table quotes alter column status set default 'enviado';

-- ---------------------------------------------------------------
-- 3. Datos de aprobación del cliente
-- ---------------------------------------------------------------
alter table quotes add column if not exists public_token uuid;
alter table quotes add column if not exists approved_at  timestamptz;
alter table quotes add column if not exists approved_ip  text;
alter table quotes add column if not exists decided_by   text; -- nombre que dejó el cliente al decidir

-- Se llena en dos pasos (no en el DEFAULT) para garantizar que cada
-- fila existente reciba un token único propio.
update quotes set public_token = gen_random_uuid() where public_token is null;

alter table quotes alter column public_token set not null;
alter table quotes alter column public_token set default gen_random_uuid();

create unique index if not exists quotes_public_token_idx on quotes(public_token);

-- ---------------------------------------------------------------
-- 4. Validación de valores permitidos (después de migrar los datos)
-- ---------------------------------------------------------------
alter table quotes drop constraint if exists quotes_status_check;
alter table quotes add constraint quotes_status_check
  check (status in ('enviado', 'aprobado', 'rechazado', 'vencido'));

alter table quotes drop constraint if exists quotes_work_status_check;
alter table quotes add constraint quotes_work_status_check
  check (work_status in ('pendiente', 'en_ejecucion', 'cobrado'));

-- ---------------------------------------------------------------
-- 5. Notificaciones in-app para el dueño del presupuesto
-- ---------------------------------------------------------------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  quote_id uuid references quotes(id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;

-- El usuario solo lee y marca como leídas sus propias notificaciones.
-- La creación queda reservada a las Edge Functions (service_role).
drop policy if exists "notifications: owner select" on notifications;
create policy "notifications: owner select" on notifications
  for select using (auth.uid() = user_id);

drop policy if exists "notifications: owner update" on notifications;
create policy "notifications: owner update" on notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists notifications_user_unread_idx
  on notifications(user_id, read, created_at desc);

-- ---------------------------------------------------------------
-- 6. Vencimiento automático de presupuestos sin respuesta
--    Un presupuesto 'enviado' cuya validez ya pasó se marca 'vencido'.
-- ---------------------------------------------------------------
create or replace function expire_old_quotes() returns void
language plpgsql security definer as $$
begin
  update quotes
    set status = 'vencido', updated_at = now()
  where status = 'enviado'
    and (date + coalesce(validity_days, 7)) < current_date;
end;
$$;

select cron.unschedule('expire-old-quotes-daily')
  where exists (select 1 from cron.job where jobname = 'expire-old-quotes-daily');

select cron.schedule('expire-old-quotes-daily', '0 7 * * *', 'select expire_old_quotes()');
