import { isSupportedCountry, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'
import { z } from 'zod'

// The payer's name, billing address and phone: without a saved card Monrem's
// checkout requires them all.

// ISO 3166-1 alpha-2.
export const COUNTRY_CODES = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD ' +
  'CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF ' +
  'GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN ' +
  'KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA ' +
  'NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI ' +
  'SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI ' +
  'VN VU WF WS YE YT ZA ZM ZW'
).split(' ')

// Monrem's payment page takes names in Latin letters and spaces only (as on the card).
const NAME = /^[A-Za-z]+( [A-Za-z]+)*$/
const name = (what: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, ' '))
    .pipe(z.string().min(1, `Enter the ${what}`).max(50).regex(NAME, `The ${what}: Latin letters and spaces only, as on the card`))

export const BillingAddress = z
  .object({
    firstName: name('first name'),
    lastName: name('last name'),
    street: z.string().trim().min(3, 'Enter the street address').max(120),
    city: z.string().trim().min(2, 'Enter the city').max(60),
    postCode: z.string().trim().min(2, 'Enter the postal code').max(16),
    // Asked for every country by Monrem's payment page (Georgia: the region, e.g. Tbilisi).
    state: z.string().trim().min(2, 'Enter the state or region').max(40),
    country: z.string().refine((c) => COUNTRY_CODES.includes(c), 'Pick a country'),
    // As typed (national or +international); phoneCountry is the code picked next to it.
    phone: z.string().trim().max(30),
    phoneCountry: z.string().optional(),
  })
  // Saved as E.164 ("+995555123456") with the country it belongs to.
  .transform((a, ctx) => {
    const own = (a.phoneCountry || a.country) as CountryCode
    const p = parsePhoneNumberFromString(a.phone, isSupportedCountry(own) ? own : undefined)
    if (!p?.isValid()) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Enter a valid phone number' })
      return z.NEVER
    }
    return { ...a, phone: p.number as string, phoneCountry: (p.country ?? own) as string }
  })
export type AddressForm = z.input<typeof BillingAddress>
export type BillingAddress = z.output<typeof BillingAddress>

// The saved address, or null when there is none (or it lacks a field added since).
export const savedAddress = (v: unknown): BillingAddress | null => {
  const r = BillingAddress.safeParse(v)
  return r.success ? r.data : null
}

// "Nino Beridze" → Nino / Beridze. Only a real name is offered: a nickname
// like "alexander22122" (or an email) leaves the fields for the payer to fill.
export const nameParts = (full: string) => {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2 || !parts.every((p) => NAME.test(p))) return { firstName: '', lastName: '' }
  return { firstName: parts[0].slice(0, 50), lastName: parts.slice(1).join(' ').slice(0, 50) }
}

// A starting point for the form: whatever was saved, else the user's name and
// the account's country (or Georgia).
export function addressDraft(stored: unknown, country: string | null, user: { name: string }): Required<AddressForm> {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const c = str(s.country) || (country ?? '').toUpperCase()
  const home = COUNTRY_CODES.includes(c) ? c : 'GE'
  const names = nameParts(user.name)
  const own = str(s.phoneCountry) || home
  const phone = parsePhoneNumberFromString(str(s.phone), isSupportedCountry(own) ? (own as CountryCode) : undefined)
  return {
    firstName: str(s.firstName) || names.firstName,
    lastName: str(s.lastName) || names.lastName,
    street: str(s.street),
    city: str(s.city),
    postCode: str(s.postCode),
    state: str(s.state),
    country: home,
    phone: phone ? phone.formatNational() : str(s.phone),
    phoneCountry: phone?.country ?? own,
  }
}

// What Monrem takes: customer_phone_code "995", customer_phone "555123456".
export function phoneParts(e164: string) {
  const p = parsePhoneNumberFromString(e164)
  return p ? { phoneCode: String(p.countryCallingCode), phone: String(p.nationalNumber) } : { phoneCode: '', phone: e164.replace(/\D/g, '') }
}

export const formatPhone = (e164: string) => parsePhoneNumberFromString(e164)?.formatInternational() ?? e164
