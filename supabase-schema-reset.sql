-- Presupuestador Pro — reset previo al lanzamiento + baja de límite free (3 -> 2)
-- Pegar en Supabase > SQL Editor > Run

-- ---- Resetear el contador de founders y la cuenta de prueba a estado limpio ----
update founder_counter set taken = 0;
update subscriptions set plan='free', status='inactive', founder_number=null, founder_started_at=null, current_price=null, mp_preapproval_id=null;

-- ---- Bajar el límite del plan free de 3 a 2 presupuestos por mes ----
create or replace function enforce_quote_quota() returns trigger
language plpgsql security definer as $$
declare v_plan text; v_count integer;
begin
  select plan into v_plan from subscriptions where user_id = new.user_id;
  if v_plan is null or v_plan = 'free' then
    select count(*) into v_count from quotes
      where user_id = new.user_id and created_at >= date_trunc('month', now());
    if v_count >= 2 then
      raise exception 'FREE_PLAN_LIMIT_REACHED';
    end if;
  end if;
  return new;
end;
$$;
