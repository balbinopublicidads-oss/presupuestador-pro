import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_BACK_URL = Deno.env.get('APP_BACK_URL') ?? 'https://presupuestador-pro.vercel.app/app.html'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace('Bearer ', '')
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: corsHeaders })
  }
  const user = userData.user

  const { data: sub } = await supabase.from('subscriptions').select('*').eq('user_id', user.id).maybeSingle()
  if (sub?.status === 'authorized') {
    return new Response(JSON.stringify({ error: 'Ya tenés una suscripción activa' }), { status: 400, headers: corsHeaders })
  }

  let price = 8990
  let plan = 'pro'
  if (sub?.founder_number) {
    price = sub.current_price ?? 3990
    plan = 'founder'
  } else {
    const { data: slot } = await supabase.rpc('try_assign_founder_slot', { p_user_id: user.id })
    if (slot) {
      price = 3990
      plan = 'founder'
    }
  }

  // Se crea el preapproval directamente vía API (en vez de redirigir al checkout
  // genérico del plan) porque esa es la única forma en que Mercado Pago conserva
  // el external_reference, necesario para que el webhook sepa a qué usuario
  // corresponde el pago.
  const mpRes = await fetch('https://api.mercadopago.com/preapproval', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reason: `Presupuestador Pro - ${plan === 'founder' ? 'Fundador' : 'Plan Pro'}`,
      external_reference: user.id,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: price,
        currency_id: 'ARS',
      },
      payer_email: user.email,
      back_url: APP_BACK_URL,
      status: 'pending',
    }),
  })

  const mpData = await mpRes.json()
  if (!mpRes.ok) {
    return new Response(JSON.stringify({ error: 'Error de Mercado Pago', detail: mpData }), { status: 502, headers: corsHeaders })
  }

  await supabase.from('subscriptions').update({
    plan,
    status: 'pending',
    mp_preapproval_id: mpData.id,
    current_price: price,
    updated_at: new Date().toISOString(),
  }).eq('user_id', user.id)

  return new Response(JSON.stringify({ checkoutUrl: mpData.init_point }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
