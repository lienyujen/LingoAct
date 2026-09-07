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
}): Promise<GeneratedPicture> {
  const { data, error } = await requireSupabase().functions.invoke('presenter-action', {
    body: { action: 'generate_picture', ...input },
  })
  if (error) throw error
  if (!data?.image || !data?.storyboard) throw new Error(data?.message || '無法生成四格圖。')
  const mimeType = typeof data.mimeType === 'string' ? data.mimeType : 'image/jpeg'
  return {
    storyboard: data.storyboard as PictureStoryboard,
    previewUrl: `data:${mimeType};base64,${data.image}`,
    file: fileFromBase64(data.image as string, mimeType),
  }
}
