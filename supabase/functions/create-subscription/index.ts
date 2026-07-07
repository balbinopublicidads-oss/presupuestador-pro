import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FOUNDER_PLAN_ID = '1c7ac2d30f7c4c678eded50079dba537'
const PRO_PLAN_ID = 'f5613211f5c34323a22c6938e0aa1991'

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

  let planId = PRO_PLAN_ID
  let plan = 'pro'
  let price = 8990
  if (sub?.founder_number) {
    planId = FOUNDER_PLAN_ID
    plan = 'founder'
    price = sub.current_price ?? 3990
  } else {
    const { data: slot } = await supabase.rpc('try_assign_founder_slot', { p_user_id: user.id })
    if (slot) {
      planId = FOUNDER_PLAN_ID
      plan = 'founder'
      price = 3990
    }
  }

  await supabase.from('subscriptions').update({
    plan,
    status: 'pending',
    current_price: price,
    updated_at: new Date().toISOString(),
  }).eq('user_id', user.id)

  const checkoutUrl = `https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=${planId}&external_reference=${user.id}`

  return new Response(JSON.stringify({ checkoutUrl }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
