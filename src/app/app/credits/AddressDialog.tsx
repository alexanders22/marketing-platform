'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { getCountries, getCountryCallingCode, getExampleNumber, type CountryCode } from 'libphonenumber-js'
import examples from 'libphonenumber-js/mobile/examples'
import { Loader2, MapPin } from 'lucide-react'
import { addressDraft, COUNTRY_CODES, formatPhone, type AddressForm, type BillingAddress } from '@/lib/billing-address'
import { saveBillingAddress } from './actions'

const input = 'mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none'

const regionName = (c: string) => new Intl.DisplayNames(['en'], { type: 'region' }).of(c) ?? c
const byName = (codes: string[]) => codes.map((c) => [c, regionName(c)] as const).sort((a, b) => a[1].localeCompare(b[1]))
const countries = () => byName(COUNTRY_CODES)
// Flag emoji from the two regional-indicator letters.
const flag = (c: string) => String.fromCodePoint(...[...c].map((ch) => 0x1f1a5 + ch.charCodeAt(0)))
const dialCountries = () => byName(getCountries()).map(([c, name]) => ({ code: c, label: `${flag(c)} +${getCountryCallingCode(c as CountryCode)} ${name}` }))
const examplePhone = (c: string) => getExampleNumber(c as CountryCode, examples)?.formatNational() ?? ''

// The payer's name, billing address and phone, asked for before the first card payment.
export function AddressDialog({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  initial: Required<AddressForm>
  submitLabel: string
  pending: boolean
  error?: string
  onSubmit: (a: AddressForm) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  const [phoneCountry, setPhoneCountry] = useState(initial.phoneCountry)
  const phoneRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      aria-labelledby="billing-address-title"
      onCancel={(e) => (e.preventDefault(), onClose())}
      className="m-auto w-[min(460px,calc(100vw-2rem))] rounded-2xl [color-scheme:light] bg-white p-0 text-left text-zinc-900 shadow-[0_30px_80px_-20px_rgba(16,16,32,0.45)] backdrop:bg-zinc-950/40 backdrop:backdrop-blur-[2px]"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          const v = (k: string) => String(f.get(k) ?? '')
          onSubmit({ firstName: v('firstName'), lastName: v('lastName'), street: v('street'), city: v('city'), postCode: v('postCode'), state: v('state'), country: v('country'), phone: v('phone'), phoneCountry: v('phoneCountry') })
        }}
      >
        <div className="flex gap-4 p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
            <MapPin size={19} />
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <h2 id="billing-address-title" className="text-base font-semibold">
              Billing address
            </h2>
            <p className="mt-1 text-sm text-zinc-600">The card payment needs these details. We save them for your next payments.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                First name
                <input name="firstName" required maxLength={50} pattern="[A-Za-z ]+" title="Latin letters, as on the card" placeholder="Nino" autoComplete="given-name" defaultValue={initial.firstName} className={input} />
              </label>
              <label className="block text-sm font-medium">
                Last name
                <input name="lastName" required maxLength={50} pattern="[A-Za-z ]+" title="Latin letters, as on the card" placeholder="Beridze" autoComplete="family-name" defaultValue={initial.lastName} className={input} />
              </label>
            </div>
            <label className="mt-3 block text-sm font-medium">
              Street and number
              <input name="street" required minLength={3} maxLength={120} autoComplete="street-address" defaultValue={initial.street} className={input} />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                City
                <input name="city" required minLength={2} maxLength={60} autoComplete="address-level2" defaultValue={initial.city} className={input} />
              </label>
              <label className="block text-sm font-medium">
                State / region
                <input name="state" required minLength={2} maxLength={40} autoComplete="address-level1" placeholder="Tbilisi" defaultValue={initial.state} className={input} />
              </label>
            </div>
            <div className="mt-3 grid grid-cols-[8rem_1fr] gap-3">
              <label className="block text-sm font-medium">
                Postal code
                <input name="postCode" required minLength={2} maxLength={16} autoComplete="postal-code" defaultValue={initial.postCode} className={input} />
              </label>
              <div>
                {/* Labelled by id: a wrapping label would read every country into the name. */}
                <label htmlFor={`${id}-country`} className="block text-sm font-medium">
                  Country
                </label>
                <select
                  id={`${id}-country`}
                  name="country"
                  required
                  autoComplete="country"
                  defaultValue={initial.country}
                  // The phone's code follows the country until a number is typed.
                  onChange={(e) => !phoneRef.current?.value && getCountries().includes(e.target.value as CountryCode) && setPhoneCountry(e.target.value)}
                  className={input}
                >
                  {countries().map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label htmlFor={`${id}-phone`} className="mt-3 block text-sm font-medium">
              Phone
            </label>
            <div className="grid grid-cols-[6.5rem_1fr] gap-2">
              {/* The list shows flag, code and name; closed, only flag and code. */}
              <div className="relative">
                <span aria-hidden className={`${input} pointer-events-none flex items-center justify-between`}>
                  {flag(phoneCountry)} +{getCountryCallingCode(phoneCountry as CountryCode)} <span className="text-zinc-400">▾</span>
                </span>
                <select
                  name="phoneCountry"
                  aria-label="Phone country code"
                  value={phoneCountry}
                  onChange={(e) => setPhoneCountry(e.target.value)}
                  className="absolute inset-0 mt-1 w-full cursor-pointer opacity-0"
                >
                  {dialCountries().map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                ref={phoneRef}
                id={`${id}-phone`}
                name="phone"
                type="tel"
                required
                maxLength={30}
                autoComplete="tel-national"
                placeholder={examplePhone(phoneCountry)}
                defaultValue={initial.phone}
                className={input}
              />
            </div>
            <p className="mt-1 text-xs text-zinc-500">e.g. {examplePhone(phoneCountry) || 'your mobile number'}</p>
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {error}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-zinc-100 bg-zinc-50/60 px-5 py-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
            Cancel
          </button>
          <button type="submit" disabled={pending} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50">
            {pending && <Loader2 size={14} className="animate-spin" />} {submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  )
}

// The saved address under the packs, with a way to change it.
export function BillingAddressLine({ address }: { address: BillingAddress }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string>()
  return (
    <div className="mt-1 text-xs text-zinc-500">
      Billing: {address.firstName} {address.lastName}, {[address.street, address.city, address.state, address.postCode, regionName(address.country)].filter(Boolean).join(', ')} · {formatPhone(address.phone)} ·{' '}
      <button type="button" onClick={() => (setError(undefined), setOpen(true))} className="font-medium text-indigo-600 underline">
        Change
      </button>
      {open && (
        <AddressDialog
          initial={addressDraft(address, address.country, { name: '' })}
          submitLabel="Save"
          pending={pending}
          error={error}
          onClose={() => setOpen(false)}
          onSubmit={(a) =>
            start(async () => {
              const res = await saveBillingAddress(a)
              if (res.error) return setError(res.error)
              setOpen(false)
              router.refresh()
            })
          }
        />
      )}
    </div>
  )
}
