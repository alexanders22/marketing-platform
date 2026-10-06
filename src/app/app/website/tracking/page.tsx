import type { Metadata } from 'next'
import { Radar } from 'lucide-react'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import type { TrackingReport } from '@/lib/tracking'
import { checkTracking } from '../actions'
import { Checks } from '../Checks'
import { RunButton } from '../RunButton'

export const metadata: Metadata = { title: 'Tracking — Loudpilot' }

const STANDARD = ['PageView', 'ViewContent', 'Lead', 'CompleteRegistration', 'Contact', 'Purchase']

export default async function TrackingPage() {
  const { workspace } = await requireContext()
  const last = await prisma.websiteAudit.findFirst({ where: { workspaceId: workspace.id, kind: 'TRACKING' }, orderBy: { createdAt: 'desc' } })
  const r = last?.result as TrackingReport | undefined
  const pixelId = r?.pixels[0]?.id ?? r?.site?.pixelIds[0] ?? 'YOUR_PIXEL_ID'
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto max-w-2xl">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Radar size={22} /> Tracking
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Ads learn from what happens on your website. Loudpilot checks the Meta Pixel, the Conversions API (events from your server) and the Google
            tags, and tells you what to fix.
          </p>
        </div>
        <RunButton action={checkTracking} label={r ? 'Check again' : 'Run the check'} busy="Checking…" />
      </div>

      {!r ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500">
          No check yet. It reads your website from the Brand kit and, if a Meta ad account is connected, the pixel&rsquo;s last 7 days.
        </p>
      ) : (
        <>
          <p className="text-xs text-zinc-500">
            Checked {last!.createdAt.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            {r.url ? ` · ${r.url}` : ''}
          </p>
          <Checks checks={r.checks} label="Tracking checks" />

          {r.pixels.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Events in the last 7 days</h2>
              <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
                <table className="w-full text-sm" aria-label="Pixel events">
                  <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                    <tr>
                      <th className="p-2.5">Pixel · event</th>
                      <th className="p-2.5 text-right">From browsers</th>
                      <th className="p-2.5 text-right">From your server</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {r.pixels.flatMap((p) => {
                      const events = [...new Set([...STANDARD.filter((e) => p.web[e] || p.server[e]), ...Object.keys(p.web), ...Object.keys(p.server)])]
                      return events.map((e) => (
                        <tr key={`${p.id}-${e}`}>
                          <td className="p-2.5">
                            <span className="text-zinc-400">{p.name} · </span>
                            {e}
                          </td>
                          <td className="p-2.5 text-right tabular-nums">{(p.web[e] ?? 0).toLocaleString('en-US')}</td>
                          <td className="p-2.5 text-right tabular-nums">{(p.server[e] ?? 0).toLocaleString('en-US')}</td>
                        </tr>
                      ))
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      <details className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
        <summary className="cursor-pointer font-semibold">How to install the Meta Pixel and the Conversions API</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-zinc-700">
          <li>
            <b>Pixel.</b> In Meta Events Manager → Connect data → Web, create a pixel (dataset). Paste this into the &lt;head&gt; of every page:
            <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-100">{`<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');
</script>`}</pre>
            WordPress, Wix, Shopify and Tilda have a Meta Pixel field — paste only the ID there.
          </li>
          <li>
            <b>Conversion events.</b> On the thank-you page after a form: <code className="rounded bg-zinc-100 px-1">fbq(&apos;track&apos;, &apos;Lead&apos;)</code>; after a
            sign-up <code className="rounded bg-zinc-100 px-1">CompleteRegistration</code>; after a payment{' '}
            <code className="rounded bg-zinc-100 px-1">Purchase</code> with value and currency.
          </li>
          <li>
            <b>Conversions API.</b> Shopify, WooCommerce and Wix: turn on &ldquo;Maximum&rdquo; data sharing in their Meta app. Other sites: Events Manager →
            Settings → Conversions API → &ldquo;Set up with Gateway&rdquo;, or a server-side Google Tag Manager container.
          </li>
          <li>
            <b>No double counting.</b> When an event is sent from both browser and server, give both the same <code className="rounded bg-zinc-100 px-1">event_id</code>.
          </li>
          <li>Run this check again — results show up within an hour of the first events.</li>
        </ol>
      </details>
    </div>
  )
}
