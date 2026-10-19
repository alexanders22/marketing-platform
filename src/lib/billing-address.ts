import { z } from 'zod'

// The payer's billing address: Monrem's checkout needs street, city and country.

// ISO 3166-1 alpha-2.
export const COUNTRY_CODES = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ ' +
  'DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT ' +
  'JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG ' +
  'NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH ' +
  'TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ')

export const BillingAddress = z.object({
  street: z.string().trim().min(3, 'Enter the street address').max(120),
  city: z.string().trim().min(2, 'Enter the city').max(60),
  postCode: z.string().trim().max(16).default(''),
  country: z.string().refine((c) => COUNTRY_CODES.includes(c), 'Pick a country'),
})
export type BillingAddress = z.infer<typeof BillingAddress>

// The saved address, or null when there is none (or it no longer validates).
export const savedAddress = (v: unknown): BillingAddress | null => {
  const r = BillingAddress.safeParse(v)
  return r.success ? r.data : null
}

// A starting point for the form: the saved address, else the account's country (or Georgia).
export const addressDraft = (saved: BillingAddress | null, country: string | null): BillingAddress =>
  saved ?? { street: '', city: '', postCode: '', country: country && COUNTRY_CODES.includes(country.toUpperCase()) ? country.toUpperCase() : 'GE' }
