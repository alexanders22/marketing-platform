// Browser-only helpers for images the user picks.

// Downscale to `max` px on the long side and re-encode as JPEG.
export async function fileToJpeg(file: File, max = 1280, quality = 0.85): Promise<{ data: string; preview: string }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = url
    })
    const scale = Math.min(1, max / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const preview = canvas.toDataURL('image/jpeg', quality)
    return { data: preview.split(',')[1], preview }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const dataUrlToBase64 = (dataUrl: string) => dataUrl.split(',')[1]
