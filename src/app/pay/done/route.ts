// Where Monrem sends the customer back after paying (the checkout's return
// URL). It needs no session: Monrem may come back in our payment frame or
// with a form POST, and then the browser leaves our SameSite=Lax session
// cookie out, so /app would bounce to the login page. This page moves the
// whole tab to the credits page itself — a same-site navigation that carries
// the cookie.

const page = (to: string) => `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment — Loudpilot</title>
<p style="font:15px/1.5 system-ui,sans-serif;text-align:center;margin-top:20vh;color:#3f3f46">
  Back to Loudpilot…<br><a href="${to}" target="_top">Continue</a>
</p>
<script>
  var to = ${JSON.stringify(to)}
  try { if (window.top !== window.self) window.top.location.replace(to); else location.replace(to) } catch (e) { location.replace(to) }
</script>
</html>`

function back(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get('payment') ?? url.searchParams.get('order_id') ?? ''
  const to = /^[A-Za-z0-9_-]{1,64}$/.test(id) ? `/app/credits?payment=${id}&back=1` : '/app/credits'
  return new Response(page(to), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}

export const GET = back
export const POST = back
