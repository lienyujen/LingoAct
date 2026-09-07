import { presenterLookup } from './presenterI18n'
import type { PresenterT } from './presenterI18n'
import { requireSupabase } from './supabase'

// The teacher's half of the four-panel picture. The panels and the target words
// stay here and never travel on the question: they describe what the picture
// shows, which is what the class is being asked to work out.
export type PictureStoryboard = {
  title: string
  cast: string
  panels: string[]
  targetWords: string[]
  pattern: string
  spokenPrompt: string
  writtenPrompt: string
  orderPrompt: string
}

export type GeneratedPicture = {
  storyboard: PictureStoryboard
  previewUrl: string
  file: File
}

function fileFromBase64(base64: string, mimeType: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  // The extension has to agree with the type: the upload path reads the
  // filename to decide where in the bucket the object goes.
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'
  return new File([bytes], `picture.${extension}`, { type: mimeType })
}

// Comes back as bytes rather than as a stored object on purpose: a picture the
// teacher does not send should leave nothing behind, and they will ask for
// several before one is right.
export async function generatePicture(input: {
  sessionId: string
  presenterToken: string
  direction: string
}, t: PresenterT = presenterLookup('zh-TW')): Promise<GeneratedPicture> {
  const { data, error } = await requireSupabase().functions.invoke('presenter-action', {
    body: { action: 'generate_picture', ...input },
  })
  if (error) throw error
  if (!data?.image || !data?.storyboard) throw new Error(data?.message || t('pictureGenerateFailed'))
  const mimeType = typeof data.mimeType === 'string' ? data.mimeType : 'image/jpeg'
  return {
    storyboard: data.storyboard as PictureStoryboard,
    previewUrl: `data:${mimeType};base64,${data.image}`,
    file: fileFromBase64(data.image as string, mimeType),
  }
}

// The picture the teacher already had on screen. Nothing is generated: the AI
// only reads it and writes the instruction, so what comes back is a storyboard
// with no cast and no panels — there is no story to invent and nothing to draw.
export async function describePicture(input: {
  sessionId: string
  presenterToken: string
  direction: string
  file: File
}, t: PresenterT = presenterLookup('zh-TW')): Promise<GeneratedPicture & { caution: string }> {
  const bytes = new Uint8Array(await input.file.arrayBuffer())
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  const base64 = btoa(binary)
  const mimeType = input.file.type || 'image/png'

  const { data, error } = await requireSupabase().functions.invoke('presenter-action', {
    body: {
      action: 'describe_picture',
      sessionId: input.sessionId,
      presenterToken: input.presenterToken,
      direction: input.direction,
      imageBase64: base64,
      mimeType,
    },
  })
  if (error) throw error
  if (!data?.storyboard) throw new Error(data?.message || t('pictureReadFailed'))
  return {
    storyboard: data.storyboard as PictureStoryboard,
    previewUrl: `data:${mimeType};base64,${base64}`,
    file: input.file,
    caution: typeof data.storyboard.caution === 'string' ? data.storyboard.caution : '',
  }
}

// Cut along the middle of the picture, which is where the drawing prompt puts
// the gutter. The inner edges are trimmed by a hair: a panel's own frame stops
// short of the centre line, so the sliver being lost is white, and what it
// buys is that no panel arrives with the corner of its neighbour in it.
const GUTTER_TRIM = 0.012

async function panelBlob(bitmap: ImageBitmap, column: number, row: number, t: PresenterT) {
  const width = Math.floor(bitmap.width / 2)
  const height = Math.floor(bitmap.height / 2)
  const trimX = Math.round(width * GUTTER_TRIM)
  const trimY = Math.round(height * GUTTER_TRIM)
  const sourceX = column === 0 ? 0 : width + trimX
  const sourceY = row === 0 ? 0 : height + trimY
  const sourceWidth = width - trimX
  const sourceHeight = height - trimY

  const canvas = document.createElement('canvas')
  canvas.width = sourceWidth
  canvas.height = sourceHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error(t('imageProcessFailed'))
  context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (!blob) throw new Error(t('imageProcessFailed'))
  return blob
}

// In reading order: 左上, 右上, 左下, 右下.
export async function splitIntoPanels(file: File, t: PresenterT = presenterLookup('zh-TW')) {
  const bitmap = await createImageBitmap(file)
  try {
    const panels: File[] = []
    for (const [column, row] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const blob = await panelBlob(bitmap, column, row, t)
      panels.push(new File([blob], 'panel.jpg', { type: 'image/jpeg' }))
    }
    return panels
  } finally {
    bitmap.close()
  }
}

// Uploaded in a shuffled order, and that is not cosmetic: panels are recorded
// as screenshots so deleting the class removes them, and students can read that
// table — created_at included. Sending them up in reading order would leave the
// answer in the timestamps.
export async function dispatchPictureOrdering(input: {
  sessionId: string
  presenterToken: string
  file: File
  promptText: string
  title: string
}, t: PresenterT = presenterLookup('zh-TW')) {
  const supabase = requireSupabase()
  const panels = (await splitIntoPanels(input.file, t)).map((file, index) => ({ file, order: index + 1 }))
  for (let index = panels.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[panels[index], panels[swap]] = [panels[swap], panels[index]]
  }

  const uploaded: Array<{ screenshotId: string; storagePath: string; order: number }> = []
  for (const panel of panels) {
    const { data: prepared, error: prepareError } = await supabase.functions.invoke('presenter-action', {
      body: {
        action: 'prepare_screenshot_upload',
        sessionId: input.sessionId,
        presenterToken: input.presenterToken,
        fileName: panel.file.name,
      },
    })
    if (prepareError) throw prepareError
    if (!prepared?.screenshotId || !prepared?.storagePath || !prepared?.uploadToken) {
      throw new Error(prepared?.message || t('pictureUploadPrepareFailed'))
    }
    const { error: uploadError } = await supabase.storage
      .from('lingoact-screenshots')
      .uploadToSignedUrl(prepared.storagePath, prepared.uploadToken, panel.file, {
        contentType: 'image/jpeg',
        upsert: false,
      })
    if (uploadError) throw uploadError
    uploaded.push({ screenshotId: prepared.screenshotId, storagePath: prepared.storagePath, order: panel.order })
  }

  const { data, error } = await supabase.functions.invoke('presenter-action', {
    body: {
      action: 'create_picture_ordering',
      sessionId: input.sessionId,
      presenterToken: input.presenterToken,
      panels: uploaded,
      promptText: input.promptText,
      title: input.title,
    },
  })
  if (error) throw error
  if (!data?.question) throw new Error(data?.message || t('sendFailed'))
  return data.question as { id: string }
}
