# Gzavnili data endpoint

Lets the Gzavnili website assistant answer "where is my parcel?". When it needs a parcel, Loudpilot sends a signed
request here. This service reads one view in the Brave database through a read-only user and answers with the status.
Loudpilot never connects to the database and never holds its password.

Only `track_parcel` is supported: the tracking number **and** the phone on the parcel. When either one doesn't match, the answer
is "not found". The phone, name and address are never sent back.

## 1. In Brave (their side, ~10 minutes)

A read-only user that sees one view with five columns (Postgres; rename the table and columns to theirs):

```sql
CREATE VIEW loudpilot_parcels AS
  SELECT tracking_number, phone, status, eta, amount_due FROM parcels;
CREATE USER loudpilot_ro WITH PASSWORD '…';
GRANT CONNECT ON DATABASE brave TO loudpilot_ro;
GRANT USAGE ON SCHEMA public TO loudpilot_ro;
GRANT SELECT ON loudpilot_parcels TO loudpilot_ro;
```

`status` is shown to customers as it is, so it should be readable text. `eta` is a date, `amount_due` is a number. If
the database only accepts known addresses, allow our server's IP.

## 2. Run (our server, next to Loudpilot)

```bash
BRAVE_DATABASE_URL='postgres://loudpilot_ro:…@brave-host:5432/brave' \
LOUDPILOT_SECRET='lpsec_…' PORT=4100 \
pm2 start integrations/gzavnili/server.mjs --name gzavnili-endpoint
```

- `LOUDPILOT_SECRET` — Loudpilot → (the Gzavnili company) → Website → Loudpilot Tag → Site secret.
- `PARCELS_VIEW` — another view name, if needed (default `loudpilot_parcels`).
- Check the database first: `node integrations/gzavnili/server.mjs --check GZ100200300 599112233`.
- `GET /health` answers `{"ok":true}` when the database is reachable.

It listens on 127.0.0.1 only. Loudpilot refuses private addresses, so put it behind nginx on a public HTTPS
name, e.g. `https://gz-data.loudpilot.app/loudpilot` → `127.0.0.1:4100`.

The log has one line per request (`time action status ms`), never parcel data.

## 3. In Loudpilot

Inbox → Assistant (Gzavnili company):

- Your data endpoint: `https://gz-data.loudpilot.app/loudpilot`
- Lookup `track_parcel`: *Status of a parcel: where it is, when it arrives and what is due. Ask for the tracking
  number and the phone number the parcel was sent to.* Details: `tracking_number, phone`. Not "signed-in only".
- *Send a test request* with a real tracking number and phone should show the status.

Then try it in the demo shop (Website → Loudpilot Tag → Try it in a demo shop) before switching the chat on for
gzavnili.com.
