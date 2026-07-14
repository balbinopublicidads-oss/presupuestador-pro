import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('MP_WEBHOOK_SECRET')!

Deno.serve(async (req) => {
  const url = new URL(req.url)
  if (url.searchParams.get('secret') !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  let preapprovalId: string | null = url.searchParams.get('id')
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      preapprovalId = body?.data?.id ?? preapprovalId
    } catch (_e) { /* body vacío, se ignora */ }
  }

  if (!preapprovalId) {
    return new Response('ok', { status: 200 })
  }

  const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
    headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` },
  })
  if (!mpRes.ok) return new Response('ok', { status: 200 })
  const mpData = await mpRes.json()

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Primero intenta por mp_preapproval_id (queda seteado desde create-subscription
  // apenas se crea la suscripción). Si no encuentra fila, usa external_reference
  // como respaldo (por si la suscripción se generó por otra vía).
  const { data: byPreapproval } = await supabase.from('subscriptions')
    .update({ status: mpData.status, updated_at: new Date().toISOString() })
    .eq('mp_preapproval_id', preapprovalId)
    .select()

  if (!byPreapproval || byPreapproval.length === 0) {
    const userId = mpData.external_reference
    if (userId) {
      await supabase.from('subscriptions')
        .update({ status: mpData.status, mp_preapproval_id: preapprovalId, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
    }
  }

  return new Response('ok', { status: 200 })
})
