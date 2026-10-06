import { expect, test } from '@playwright/test'
import { ctaLine, readCta, withUtm } from '../../src/lib/cta'

test('UTM tags per network keep the tags the author set', () => {
  expect(withUtm('https://x.ge/a', 'FACEBOOK', { campaign: 'Black Friday 2026!', postId: 'p1' })).toBe(
    'https://x.ge/a?utm_source=facebook&utm_medium=social&utm_campaign=black-friday-2026&utm_content=p1',
  )
  expect(withUtm('https://x.ge/a?utm_source=newsletter', 'INSTAGRAM', {})).toBe('https://x.ge/a?utm_source=newsletter&utm_medium=social&utm_campaign=loudpilot')
  expect(withUtm('not a url', 'FACEBOOK', {})).toBe('not a url')
})

test('the closing line per network and type', () => {
  expect(ctaLine({ type: 'WHATSAPP', phone: '+995 555 12-34-56' }, 'FACEBOOK')).toBe('💬 WhatsApp us: https://wa.me/995555123456')
  expect(ctaLine({ type: 'WHATSAPP', phone: '+995 555 12-34-56' }, 'INSTAGRAM')).toBe('💬 WhatsApp: +995 555 12-34-56')
  expect(ctaLine({ type: 'CALL', phone: '+995 32 2 00 00 00' }, 'INSTAGRAM')).toBe('📞 Call us: +995 32 2 00 00 00')
  expect(ctaLine({ type: 'MESSAGE' }, 'FACEBOOK')).toBe('✉️ Send us a message')
  expect(ctaLine({ type: 'SHOP', url: 'https://shop.ge' }, 'INSTAGRAM')).toBe('🛍️ Shop now — link in bio')
  expect(ctaLine(null, 'FACEBOOK')).toBe('')
})

test('validation: links and phones where the type needs them', () => {
  expect(readCta({ type: 'BOOK', url: null })).toBeNull()
  expect(readCta({ type: 'BOOK', url: 'javascript:alert(1)' })).toBeNull()
  expect(readCta({ type: 'CALL', phone: 'abc' })).toBeNull()
  expect(readCta({ type: 'NOPE' })).toBeNull()
  expect(readCta({ type: 'MESSAGE' })).toEqual({ type: 'MESSAGE' })
})
