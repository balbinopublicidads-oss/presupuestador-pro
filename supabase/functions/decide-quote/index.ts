// Registra la decisión del cliente (aprobar / rechazar) sobre un presupuesto,
// sin necesidad de que tenga cuenta. Se autoriza solo con el public_token.
// Verify JWT debe estar DESACTIVADO en esta función.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  let body: { token?: string; decision?: string; name?: string }
  try {
    body = await req.json()
  } catch (_e) {
    return json({ error: 'Body inválido' }, 400)
  }

  const token = body.token ?? ''
  const decision = body.decision ?? ''
  const name = (body.name ?? '').toString().slice(0, 120).trim()

  if (!UUID_RE.test(token)) return json({ error: 'Link inválido' }, 400)
  if (decision !== 'aprobado' && decision !== 'rechazado') {
    return json({ error: 'Decisión inválida' }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: quote, error: findErr } = await supabase
    .from('quotes')
    .select('id, user_id, number, client_name, status')
    .eq('public_token', token)
    .maybeSingle()

  if (findErr) {
    console.error(findErr)
    return json({ error: 'Error al buscar el presupuesto' }, 500)
  }
  if (!quote) return json({ error: 'Presupuesto no encontrado' }, 404)

  // Una decisión ya tomada no se puede cambiar desde el link público:
  // evita que el presupuesto quede rebotando entre aprobado y rechazado.
  if (quote.status === 'aprobado' || quote.status === 'rechazado') {
    return json({ error: 'YA_DECIDIDO', status: quote.status }, 409)
  }

  // Cloudflare/Supabase entregan la cadena de proxies; el primer valor es el cliente.
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null

  const { error: updErr } = await supabase
    .from('quotes')
    .update({
      status: decision,
      approved_at: new Date().toISOString(),
      approved_ip: ip,
      decided_by: name || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', quote.id)

  if (updErr) {
    console.error(updErr)
    return json({ error: 'No se pudo registrar la decisión' }, 500)
  }

  // Notificación in-app para el dueño del presupuesto.
  const quien = name || quote.client_name || 'El cliente'
  await supabase.from('notifications').insert({
    user_id: quote.user_id,
    type: decision === 'aprobado' ? 'quote_approved' : 'quote_rejected',
    title: decision === 'aprobado'
      ? `${quien} aprobó el presupuesto N° ${quote.number}`
      : `${quien} rechazó el presupuesto N° ${quote.number}`,
    body: decision === 'aprobado'
      ? 'Ya podés arrancar el trabajo. Pasalo a "en ejecución" cuando empieces.'
      : null,
    quote_id: quote.id,
  })

  return json({ ok: true, status: decision })
})
