import {
  File, FileAudio, FileCode, FileImage, FilePdf, FilePpt, FileText, FileVideo, FileXls, FileZip,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'

// What a student handed in, told from the name they handed it in under.
//
// The extension leads rather than the MIME type: a browser reports .xlsx as
// application/octet-stream often enough, and the name is what the student sees
// beside the icon, so an icon that disagrees with the name looks like a bug
// even when the MIME type was right.
const byExtension: Array<[RegExp, Icon]> = [
  [/\.(xlsx?|xlsm|csv|tsv|ods|numbers)$/i, FileXls],
  [/\.(pptx?|odp|key)$/i, FilePpt],
  [/\.pdf$/i, FilePdf],
  [/\.(docx?|odt|rtf|pages|txt|md)$/i, FileText],
  [/\.(png|jpe?g|webp|gif|heic|heif|bmp|svg|avif)$/i, FileImage],
  [/\.(mp3|wav|m4a|aac|ogg|oga|flac|weba)$/i, FileAudio],
  [/\.(mp4|mov|webm|avi|mkv|m4v)$/i, FileVideo],
  [/\.(zip|rar|7z|tar|gz|tgz|bz2)$/i, FileZip],
  [/\.(js|mjs|cjs|tsx?|jsx|py|java|cs|cpp?|h|rb|go|rs|php|html?|css|json|xml|ya?ml|sql|sh|ps1)$/i, FileCode],
]

const byMimePrefix: Array<[string, Icon]> = [
  ['image/', FileImage],
  ['audio/', FileAudio],
  ['video/', FileVideo],
  ['text/', FileText],
]

export function fileTypeIcon(name: string, mimeType?: string | null) {
  for (const [pattern, icon] of byExtension) if (pattern.test(name)) return icon
  const mime = (mimeType || '').toLowerCase()
  if (mime.includes('spreadsheet') || mime.includes('excel')) return FileXls
  if (mime.includes('presentation') || mime.includes('powerpoint')) return FilePpt
  if (mime.includes('pdf')) return FilePdf
  if (mime.includes('word') || mime.includes('document')) return FileText
  if (mime.includes('zip') || mime.includes('compressed')) return FileZip
  for (const [prefix, icon] of byMimePrefix) if (mime.startsWith(prefix)) return icon
  return File
}

// Whether to draw it rather than offer it as something to open. What the file
// actually is decides, not which button sent it.
export function isImageFile(mimeType: string | null | undefined, name: string) {
  return (mimeType || '').toLowerCase().startsWith('image/')
    || /\.(png|jpe?g|webp|gif|heic|heif|bmp|avif)$/i.test(name)
}
