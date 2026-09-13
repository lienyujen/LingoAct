export type InteractionDraft = { kind: 'ordering' | 'matching'; items: string[]; sentenceMode: boolean; hasAnswer: boolean; shareScreenshot: boolean; tiles: string[] }
export type InteractionGenerated = { title?: string; items?: string[]; regions?: Array<{ box_2d: number[]; label: string }> }
export const fileDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file)
})
export async function sliceInteractionImage(url: string, regions: NonNullable<InteractionGenerated['regions']>) {
  const image = new Image(); image.src = url; await image.decode()
  const pad = Math.round(Math.min(image.width, image.height) * .01), tiles: string[] = []
  for (const region of regions) {
    if (region.box_2d?.length !== 4 || region.box_2d.some(n => !Number.isFinite(n))) continue
    const [y1, x1, y2, x2] = region.box_2d.map(n => Math.max(0, Math.min(1000, n)))
    if (x2 <= x1 || y2 <= y1) continue
    const left = Math.max(0, Math.round(x1 * image.width / 1000) - pad), top = Math.max(0, Math.round(y1 * image.height / 1000) - pad)
    const width = Math.min(image.width, Math.round(x2 * image.width / 1000) + pad) - left, height = Math.min(image.height, Math.round(y2 * image.height / 1000) + pad) - top
    if (width < 8 || height < 8) continue
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d'); if (!context) throw new Error('無法切圖。')
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height)
    context.drawImage(image, left, top, width, height, 0, 0, width, height)
    tiles.push(canvas.toDataURL('image/png'))
  }
  return tiles
}
