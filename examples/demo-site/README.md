# BoxRoute — demo website for the Loudpilot Tag and assistant

A made-up parcel-delivery company (parcels from the USA, UK, China and Turkey to Georgia) with:

- the Loudpilot Tag in the `<head>`: visits, sources, calls, the contact form (Lead), paying a parcel (Purchase);
- two demo customers to sign in as (Nino, Giorgi) — the page sends `identify` with a `user_hash` made on the server;
- the **data endpoint** `POST /loudpilot` the assistant asks: signature checked, tracking number + phone for anonymous
  lookups, only the signed-in customer's own parcels for "my parcels";
- `/requests` — every lookup Loudpilot made, the signature check and the answer (refreshes itself; good for showing
  that Loudpilot never sees the data, only the answers).

One file, no dependencies, Node 20+. All data is made up and kept in memory. It is also the reference
implementation of a data endpoint for companies (see `dataEndpoint()` in `server.mjs` and `/docs/website#data-endpoint`).

## 1. Loudpilot

1. Create a company **BoxRoute (demo)**.
2. **Website → Loudpilot Tag**: copy the site key (`lp_…`) and, under *Site secret*, the secret (`lpsec_…`).
   In *Your domains* put the demo's domain (e.g. `demo.loudpilot.app`).
3. **Inbox → Assistant**:
   - Name `BoxRoute assistant`, first message `Hi! I can help with tariffs, delivery and your parcels.`
   - Main instructions and Facts — paste the blocks below.
   - Red-flag topics: `compensation`, `lost parcel`, `damaged`, `complaint`, `refund`.
   - E-mail / Telegram alerts: yours.
   - Your data endpoint: `https://demo.loudpilot.app/loudpilot`.
   - Lookups:
     - `track_parcel` — *Status of a parcel. Ask for the tracking number and the phone number on the parcel.* —
       details `tracking_number, phone` — not for signed-in only.
     - `my_parcels` — *The signed-in customer's parcels: status, arrival and amount due.* — no details —
       **For signed-in customers only**.
   - *Send a test request* on `track_parcel` with `BR-240117` / `599112233` should answer “On the way to Tbilisi”.
   - Switch on **Show the chat on my website** and save.

Main instructions:

```
You are the assistant of BoxRoute, a parcel-forwarding company: customers shop online in the USA, the United Kingdom,
China and Turkey, ship to their free BoxRoute address there, and we bring the parcels to Georgia. Customers are
people in Tbilisi who shop abroad. Be friendly and brief. Help with tariffs and delivery times, how to get an address,
customs rules, pickup branches and the status of parcels. For anything about a specific parcel use the lookups.
```

Facts and answers:

```
- Tariffs: USA 9 GEL/kg (6–9 days), United Kingdom 10 GEL/kg (5–8 days), China 12 GEL/kg (12–18 days), Turkey 6 GEL/kg (3–5 days). Minimum charge 1 kg.
- Courier in Tbilisi: 5 GEL. Pickup at 6 branches: Vake, Saburtalo, Didube, Gldani, Isani, Varketili; 10:00–20:00 every day.
- Free address in all four countries after sign-up on the website.
- Customs: a parcel worth more than 300 GEL needs an invoice uploaded in the customer's account.
- Insurance: 3% of the declared value, up to 3,000 GEL.
- Phone +995 32 2 00 00 00, WhatsApp +995 599 00 00 00.
```

## 2. Run

```bash
LOUDPILOT_SITE_KEY=lp_… LOUDPILOT_SECRET=lpsec_… PORT=4000 node examples/demo-site/server.mjs
# against a local Loudpilot: add LOUDPILOT_URL=http://localhost:3100
```

On the server, next to Loudpilot (PM2 + nginx on `demo.loudpilot.app` → `127.0.0.1:4000`, HTTPS):

```bash
LOUDPILOT_SITE_KEY=lp_… LOUDPILOT_SECRET=lpsec_… PORT=4000 pm2 start examples/demo-site/server.mjs --name boxroute-demo
```

## 3. Demo script

| Step | Do | Show |
|---|---|---|
| 1 | Open `https://demo.loudpilot.app/?utm_source=facebook&utm_medium=paid&utm_campaign=autumn` | The visit from “facebook / paid · autumn” in *Website → Loudpilot Tag → Latest events* |
| 2 | Chat: “How much is shipping from the USA? How long?” | Answer from the facts |
| 3 | Chat: “Where is my parcel BR-240121? My phone is 577 44 55 66” | `/requests`: a signed `track_parcel`, answer “Held at customs” — and the assistant explains the invoice |
| 4 | Same, with a wrong phone | “Not found” — the details must match |
| 5 | *Sign in as Nino*, new chat: “Show my parcels” | `/requests`: `my_parcels` for `c-1001 (verified)` only |
| 6 | Chat: “My parcel arrived damaged, I want compensation” | Red flag → hand-over, Telegram / e-mail alert, answer from *Inbox → Website chat* — the reply appears in the chat |
| 7 | Fill *Get your free address*, press *Pay* on a parcel | Lead and Purchase in the Tag report and the person’s path; with the Meta pixel set, “sent to Meta” |

Tracking numbers: `BR-240117` and `BR-240118` (Nino, `599 11 22 33`), `BR-240121` and `BR-240125` (Giorgi, `577 44 55 66`).
The server restarts with fresh data.
