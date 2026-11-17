export function heifHeader(bytes: Uint8Array) {
  const text = String.fromCharCode(...bytes.subarray(4, 96))
  return text.startsWith('ftyp') && !/avif|avis/.test(text) && /heic|heix|hevc|hevx|heim|heis|mif1|msf1/.test(text)
}

// Camera format preferences are only hints. Decode the actual image and encode
// JPEG bytes before signing an upload, including HEIC files named ".jpg".
export async function prepareStudentImage(file: File): Promise<File> {
  const header = new Uint8Array(await file.slice(0, 96).arrayBuffer())
  const heif = heifHeader(header)
    || /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
  const raster = file.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|avif)$/i.test(file.name)
    || (header[0] === 255 && header[1] === 216 && header[2] === 255)
    || (header[0] === 137 && String.fromCharCode(...header.subarray(1, 4)) === 'PNG')
  if (!heif && (!raster || /image\/(svg\+xml|gif)/.test(file.type))) return file
  if (file.size > 20 * 1024 * 1024) throw new Error('PHOTO_TOO_LARGE')
  let source: Blob = file
  let bitmap: ImageBitmap | null = null
  let image: HTMLImageElement | null = null
  let url = ''
  try {
    if (heif) {
      const { heicTo } = await import('heic-to/csp')
      source = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.94 })
    }
    try { bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' }) } catch {
      image = new Image()
      url = URL.createObjectURL(source)
      image.src = url
      await image.decode()
    }
    const width = bitmap?.width || image?.naturalWidth || 0
    const height = bitmap?.height || image?.naturalHeight || 0
    if (!width || !height) throw new Error('PHOTO_DECODE_FAILED')
    const scale = Math.min(1, 2560 / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('PHOTO_DECODE_FAILED')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage((bitmap || image)!, 0, 0, canvas.width, canvas.height)
    const jpeg = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!jpeg || jpeg.type !== 'image/jpeg') throw new Error('PHOTO_ENCODE_FAILED')
    return new File([jpeg], `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    throw new Error('PHOTO_CONVERSION_FAILED')
  } finally {
    bitmap?.close()
    if (url) URL.revokeObjectURL(url)
  }
}
