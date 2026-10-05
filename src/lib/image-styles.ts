// Looks for AI images, shared by the pickers (client) and the generator.
export const IMAGE_STYLES = {
  realistic: { label: 'Realistic photo', prompt: 'a realistic professional photograph, natural light, true-to-life colours, sharp' },
  illustration: { label: 'Illustration', prompt: 'a modern flat-colour digital illustration with clean shapes' },
  '3d': { label: '3D render', prompt: 'a clean, soft-lit 3D render with smooth materials' },
  minimal: { label: 'Minimal graphic', prompt: 'a minimal graphic composition with simple shapes, bold colour and lots of empty space' },
  watercolor: { label: 'Watercolour', prompt: 'a soft watercolour painting on paper' },
  cinematic: { label: 'Cinematic', prompt: 'a cinematic photograph with dramatic light and shallow depth of field' },
} as const
export type ImageStyle = keyof typeof IMAGE_STYLES
export const IMAGE_STYLE_IDS = Object.keys(IMAGE_STYLES) as ImageStyle[]
