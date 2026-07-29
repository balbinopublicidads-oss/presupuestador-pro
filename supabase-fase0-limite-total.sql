-- FASE 0 — Límite del plan free: de "2 por mes" a "2 de por vida"
-- Pegar en Supabase > SQL Editor > Run

create or replace function enforce_quote_quota() returns trigger
language plpgsql security definer as $$
declare v_plan text; v_count integer;
begin
  select plan into v_plan from subscriptions where user_id = new.user_id;
  if v_plan is null or v_plan = 'free' then
    -- Conteo total histórico (sin ventana de tiempo): el plan free da
    -- 2 presupuestos para probar la app, no 2 por mes.
    select count(*) into v_count from quotes where user_id = new.user_id;
    if v_count >= 2 then
      raise exception 'FREE_PLAN_LIMIT_REACHED';
    end if;
  end if;
  return new;
end;
$$;
