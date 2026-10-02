import 'server-only'
import { appUrl } from './mail'

// "Continue with Google" is shown only when an OAuth client is configured.
export function googleEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export const googleRedirectUri = () => `${appUrl()}/auth/google/callback`

export type GoogleProfile = { sub: string; email: string; name: string }

// Exchanges the authorization code directly with Google over TLS, so the
// returned id_token can be trusted without verifying its signature; we still
// check audience, issuer and that the email is verified.
export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`)
  const { id_token } = (await res.json()) as { id_token?: string }
  if (!id_token) throw new Error('Google returned no id_token')

  const payload = JSON.parse(Buffer.from(id_token.split('.')[1], 'base64url').toString('utf8'))
  if (payload.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error('id_token audience mismatch')
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) throw new Error('Bad issuer')
  if (!payload.email || payload.email_verified !== true) throw new Error('Google email is not verified')
  return { sub: String(payload.sub), email: String(payload.email).toLowerCase(), name: String(payload.name ?? '') }
}
