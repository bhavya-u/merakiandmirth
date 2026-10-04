import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const telegramChatId = Deno.env.get('TELEGRAM_CHAT_ID')
  if (!telegramToken || !telegramChatId) return json({ error: 'Telegram secrets are not configured' }, 500)

  const supabase = createClient(url, key)
  const { data: notifications, error } = await supabase.rpc('claim_operation_notifications', { p_limit: 25 })
  if (error) return json({ error: error.message }, 500)

  let sent = 0
  let failed = 0
  for (const notification of notifications ?? []) {
    const response = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramChatId, text: notification.message }),
    })
    if (response.ok) {
      await supabase.from('operation_notifications').update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        processing_started_at: null,
        failure_reason: '',
      }).eq('id', notification.id)
      sent++
    } else {
      await supabase.from('operation_notifications').update({
        status: 'failed',
        processing_started_at: null,
        failure_reason: `Telegram returned ${response.status}`,
      }).eq('id', notification.id)
      failed++
    }
  }

  return json({ sent, failed })
})
