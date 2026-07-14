-- Reconciliación manual única: la suscripción de aldanafp@hotmail.com se pagó
-- de verdad en Mercado Pago pero se creó con el flujo viejo (sin external_reference),
-- así que el webhook no la pudo vincular sola. La vinculamos a mano una vez.
update subscriptions
set status = 'authorized',
    mp_preapproval_id = '9c06d7ba0ed14e03874a4888a1b1ac7b',
    updated_at = now()
where user_id = (select id from auth.users where email = 'aldanafp@hotmail.com');
