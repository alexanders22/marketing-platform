// Looks for AI images, shared by the pickers (client) and the generator.
// `ownPalette`: the look has its own colours, brand colours only as accents.
export type ImageStyleDef = { label: string; prompt: string; ownPalette?: boolean }

export const IMAGE_STYLES = {
  realistic: { label: 'Realistic photo', prompt: 'a realistic professional photograph, natural light, true-to-life colours, sharp' },
  illustration: { label: 'Illustration', prompt: 'a modern flat-colour digital illustration with clean shapes' },
  '3d': { label: '3D render', prompt: 'a clean, soft-lit 3D render with smooth materials' },
  minimal: { label: 'Minimal graphic', prompt: 'a minimal graphic composition with simple shapes, bold colour and lots of empty space' },
  watercolor: { label: 'Watercolour', prompt: 'a soft watercolour painting on paper' },
  cinematic: { label: 'Cinematic', prompt: 'a cinematic photograph with dramatic light and shallow depth of field' },
  // The hand-drawn explainer look ("How the Economic Machine Works").
  sketch: {
    label: 'Whiteboard sketch',
    prompt:
      'a hand-drawn whiteboard explainer sketch: thin black ink line art on a plain warm off-white paper background, simple doodle characters with round heads and minimal faces, simple objects, arrows and speech bubbles explaining one idea, cross-hatched shading, lots of empty space, no gradients or photographic detail, only one or two small flat colour accents on the key object of the scene; draw only what the scene is about, nothing unrelated',
    ownPalette: true,
  },
} as const satisfies Record<string, ImageStyleDef>
export type ImageStyle = keyof typeof IMAGE_STYLES
export const IMAGE_STYLE_IDS = Object.keys(IMAGE_STYLES) as ImageStyle[]

// Off-white paper behind sketch scenes that have no picture.
export const SKETCH_PAPER = '#F4F1E6'
