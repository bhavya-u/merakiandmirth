import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const telegramChatId = Deno.env.get('TELEGRAM_CHAT_ID')
  if (!telegramToken || !telegramChatId) return json({ error: 'Telegram secrets are not configured' }, 500)
  const supabase = createClient(url, key)
  const now = new Date().toISOString()
  const { data: reminders, error } = await supabase
    .from('delivery_reminders')
    .select('id, reminder_type, orders(code,title,event,qty,total,delivery_date,customer_name,delivery_area,status)')
    .is('sent_at', null).lte('due_at', now).order('due_at').limit(100)
  if (error) return json({ error: error.message }, 500)
  let sent = 0
  for (const reminder of reminders ?? []) {
    const order = reminder.orders as Record<string, unknown>
    if (['Cancelled', 'Lost', 'Closed'].includes(String(order.status))) {
      await supabase.from('delivery_reminders').update({ sent_at: new Date().toISOString() }).eq('id', reminder.id)
      continue
    }
    const timing = String(reminder.reminder_type).replaceAll('_', ' ').toUpperCase()
    const message = `Meraki & Mirth — Delivery reminder\n\n${timing}\nClient: ${order.customer_name || 'Client not added'}\nCelebration: ${order.title}\nOrder: ${order.code}\nQuantity: ${order.qty} curated sets\nDelivery date: ${order.delivery_date ?? 'not set'}\nDelivery area: ${order.delivery_area || 'Not set'}\nQuote total: ₹${order.total}`
    const response = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: telegramChatId, text: message }) })
    if (!response.ok) continue
    await supabase.from('delivery_reminders').update({ sent_at: new Date().toISOString() }).eq('id', reminder.id)
    sent++
  }
  return json({ sent })
})
