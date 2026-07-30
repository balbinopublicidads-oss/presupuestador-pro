// Devuelve un presupuesto para que lo vea el cliente, sin necesidad de login.
// El acceso se autoriza únicamente con el public_token del presupuesto.
// Verify JWT debe estar DESACTIVADO en esta función.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// Validación estricta: si no es un UUID, no llegamos ni a consultar la base.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET') return json({ error: 'Método no permitido' }, 405)

  const token = new URL(req.url).searchParams.get('token') ?? ''
  if (!UUID_RE.test(token)) return json({ error: 'Link inválido' }, 400)

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: quote, error } = await supabase
    .from('quotes')
    .select('id, user_id, number, date, validity_days, client_name, client_phone, client_address, items, iva_enabled, iva_rate, discount, payment_terms, notes, status, work_status, delivery_date, approved_at, decided_by')
    .eq('public_token', token)
    .maybeSingle()

  if (error) {
    console.error(error)
    return json({ error: 'Error al buscar el presupuesto' }, 500)
  }
  if (!quote) return json({ error: 'Presupuesto no encontrado' }, 404)

  // Solo los datos del negocio que el cliente necesita ver en el documento.
  const { data: biz } = await supabase
    .from('businesses')
    .select('name, cuit, phone, email, address, logo_url')
    .eq('user_id', quote.user_id)
    .maybeSingle()

  // No devolvemos user_id al cliente: es un identificador interno.
  const { user_id: _omit, ...safeQuote } = quote

  return json({ quote: safeQuote, business: biz ?? null })
})
