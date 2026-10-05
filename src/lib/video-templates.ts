import type { Motion, Position, TextStyle } from './video'

// Ready-made videos: scenes with template photos (copied into the workspace
// on create), on-screen text and a voice-over script to generate. The user
// swaps in their own photos and numbers.

export type VideoTemplateScene = {
  photo: string // "real-estate/living" → public/templates/real-estate/living.jpg
  text: string
  voice: string
  seconds: number
  motion: Motion
  position?: Position
  style?: TextStyle
}

export type VideoTemplate = {
  id: string
  name: string
  category: 'real-estate'
  blurb: string
  transition: 'cut' | 'fade'
  caption: string
  scenes: VideoTemplateScene[]
}

const RE = 'real-estate'

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  {
    id: 're-tour',
    name: 'Property tour',
    category: RE,
    blurb: 'Five rooms, one walk-through',
    transition: 'fade',
    caption: 'Take a tour of this bright 3-bedroom in Vake 🏡 118 m², terrace with a view. DM us to book a viewing.',
    scenes: [
      { photo: `${RE}/exterior`, text: 'New listing in Vake', voice: 'Welcome to your next home in Vake.', seconds: 3, motion: 'zoom-in', position: 'bottom', style: 'bold' },
      { photo: `${RE}/living`, text: 'Bright living room', voice: 'A bright living room with city and mountain views.', seconds: 3, motion: 'pan-right', style: 'caption' },
      { photo: `${RE}/kitchen`, text: 'Open kitchen with island', voice: 'An open kitchen made for family dinners.', seconds: 3, motion: 'pan-left', style: 'caption' },
      { photo: `${RE}/bedroom`, text: 'Quiet master bedroom', voice: 'A calm master bedroom with morning light.', seconds: 3, motion: 'zoom-out', style: 'caption' },
      { photo: `${RE}/terrace`, text: '118 m² · $245,000', voice: 'And a terrace for sunsets. Book your viewing today.', seconds: 4, motion: 'zoom-in', position: 'center', style: 'box' },
    ],
  },
  {
    id: 're-just-listed',
    name: 'Just listed',
    category: RE,
    blurb: 'Quick 9-second announcement',
    transition: 'cut',
    caption: 'JUST LISTED ✨ 3 bedrooms · 2 baths · 118 m² in Vake. $245,000. Message us for the details.',
    scenes: [
      { photo: `${RE}/exterior`, text: 'JUST LISTED', voice: 'Just listed!', seconds: 2.5, motion: 'zoom-in', position: 'center', style: 'box' },
      { photo: `${RE}/living`, text: '3 bedrooms · 118 m²', voice: 'Three bedrooms, one hundred eighteen square metres, in Vake.', seconds: 3, motion: 'pan-right' },
      { photo: `${RE}/terrace`, text: '$245,000\nBook a viewing', voice: 'Message us to book a viewing.', seconds: 3.5, motion: 'zoom-out', position: 'center', style: 'box' },
    ],
  },
  {
    id: 're-open-house',
    name: 'Open house invite',
    category: RE,
    blurb: 'Date, time and address',
    transition: 'fade',
    caption: 'Open house this Saturday, 14:00–17:00 📍 Chavchavadze Ave 12. Come and see it in person!',
    scenes: [
      { photo: `${RE}/living`, text: 'OPEN HOUSE', voice: 'You are invited to our open house.', seconds: 3, motion: 'zoom-in', position: 'center', style: 'box' },
      { photo: `${RE}/kitchen`, text: 'Saturday · 14:00–17:00', voice: 'This Saturday, from two to five.', seconds: 3, motion: 'pan-left' },
      { photo: `${RE}/exterior`, text: 'Chavchavadze Ave 12', voice: 'Chavchavadze Avenue twelve. See you there!', seconds: 3.5, motion: 'zoom-out' },
    ],
  },
  {
    id: 're-luxury',
    name: 'Luxury villa',
    category: RE,
    blurb: 'Slow, cinematic, premium',
    transition: 'fade',
    caption: 'A modern villa with a pool, terrace and garden. Private viewings by appointment.',
    scenes: [
      { photo: `${RE}/villa`, text: 'Modern villa with pool', voice: 'Some homes are simply different.', seconds: 4, motion: 'zoom-in', style: 'minimal' },
      { photo: `${RE}/terrace`, text: 'Sunset terrace', voice: 'Sunsets from your own terrace.', seconds: 4, motion: 'pan-right', style: 'minimal' },
      { photo: `${RE}/living`, text: 'Light-filled interiors', voice: 'Light-filled rooms, designed for living.', seconds: 4, motion: 'zoom-out', style: 'minimal' },
      { photo: `${RE}/villa`, text: 'Private viewings by appointment', voice: 'Private viewings by appointment.', seconds: 4, motion: 'zoom-out', position: 'center', style: 'box' },
    ],
  },
  {
    id: 're-sold',
    name: 'Sold — thinking of selling?',
    category: RE,
    blurb: 'Social proof plus a call to sellers',
    transition: 'cut',
    caption: 'SOLD 🔑 Another family has a new home. Thinking of selling? Get a free valuation from our team.',
    scenes: [
      { photo: `${RE}/villa`, text: 'SOLD', voice: 'Sold!', seconds: 2.5, motion: 'zoom-in', position: 'center', style: 'box' },
      { photo: `${RE}/living`, text: 'Another family has a new home', voice: 'Another family has found their new home.', seconds: 3, motion: 'pan-right' },
      { photo: `${RE}/agent`, text: 'Thinking of selling?\nFree valuation', voice: 'Thinking of selling? Get a free valuation from our team.', seconds: 4, motion: 'zoom-out', position: 'bottom', style: 'box' },
    ],
  },
  {
    id: 're-agent',
    name: 'Meet the agent',
    category: RE,
    blurb: 'Introduce yourself to buyers',
    transition: 'fade',
    caption: 'Hi, I am Nino 👋 12 years helping families find a home in Tbilisi. Call or message me any time.',
    scenes: [
      { photo: `${RE}/agent`, text: 'Hi, I’m Nino', voice: 'Hi, I am Nino, your real estate agent in Tbilisi.', seconds: 3.5, motion: 'zoom-in' },
      { photo: `${RE}/exterior`, text: '12 years · 400+ homes sold', voice: 'For twelve years I have helped families find the right home.', seconds: 3.5, motion: 'pan-left' },
      { photo: `${RE}/living`, text: '+995 555 12 34 56', voice: 'Call or message me any time.', seconds: 3.5, motion: 'zoom-out', position: 'center', style: 'box' },
    ],
  },
]
