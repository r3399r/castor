// Browser-side image preparation, shared by the two places that send an
// image to the API: the screenshot uploader that feeds Gemini, and the
// figure uploader that fills an img-placeholder. Extracted so the
// downscale pass exists once -- it is sixty lines of canvas work whose
// failure mode (a file that silently exceeds the server's cap) is
// identical for both callers.

// Mirrors backend_new's base64ImageSchema, which caps the base64 string
// at 2,500,000 characters. base64 costs 4 bytes per 3, so this is the
// largest file that can survive encoding. Kept in step by hand -- the
// point of checking here is to say "that file is too big" while the admin
// can still do something about it, not to replace the server check.
export const MAX_IMAGE_BYTES = Math.floor((2_500_000 * 3) / 4)

export const readAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode failed'))
    img.src = url
  })

/**
 * Shrinks an oversized image until it fits under MAX_IMAGE_BYTES.
 *
 * Worth doing rather than just rejecting: a phone photo of a question, or
 * a screenshot from a high-DPI display, routinely lands at 3-5MB, and
 * "your file is too big" with no recourse would make the feature useless
 * for exactly the inputs it is meant for. Re-encodes to JPEG because a
 * screenshot PNG stays large even at half the pixels; quality 0.9 keeps
 * small text legible, which is the whole job here.
 *
 * Returns null if it can't be decoded as an image (a PDF, mainly) -- those
 * the caller rejects outright, since there is no cheap way to shrink one
 * in the browser.
 */
export const downscaleToLimit = async (
  file: File
): Promise<{ mimeType: string; dataUrl: string } | null> => {
  let objectUrl: string | null = null
  try {
    objectUrl = URL.createObjectURL(file)
    const img = await loadImage(objectUrl)

    let scale = 1
    // Each pass drops to 75% per side, so ~56% of the area. Five passes
    // reach ~5% of the original, which takes any realistic photo under the
    // cap; the bound stops a pathological input looping forever.
    for (let attempt = 0; attempt < 5; attempt++) {
      scale *= 0.75
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
      // 4 base64 chars per 3 bytes, ignoring the data: prefix.
      const bytes = Math.floor((dataUrl.split(',')[1]?.length ?? 0) * 0.75)
      if (bytes <= MAX_IMAGE_BYTES) return { mimeType: 'image/jpeg', dataUrl }
    }
    return null
  } catch {
    return null
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Reads a file as the `{ mimeType, data }` pair the API expects, shrinking
 * it first if it is over the cap.
 *
 * Returns null when the file cannot be made to fit, which for the figure
 * uploader is the only outcome worth distinguishing -- it has no use for
 * knowing whether the original or a downscaled copy was sent.
 */
export const toApiImage = async (
  file: File
): Promise<{ mimeType: string; data: string } | null> => {
  let mimeType = file.type
  let dataUrl: string

  if (file.size > MAX_IMAGE_BYTES) {
    const shrunk = await downscaleToLimit(file)
    if (!shrunk) return null
    mimeType = shrunk.mimeType
    dataUrl = shrunk.dataUrl
  } else {
    dataUrl = await readAsDataUrl(file)
  }

  return { mimeType, data: dataUrl.slice(dataUrl.indexOf(',') + 1) }
}
