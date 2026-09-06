import { useEffect, useState } from 'react'

// Loads the per-clip font subset a read-aloud item carries, so the text can be
// shown with its zhuyin or pinyin already set into the glyphs.
//
// One family per URL: each clip has its own subset cut from its own characters,
// so two questions in the same lesson are two different fonts and must not share
// a family name. Failure is silent by design — the words still read in the
// system face, just without the annotation, which beats showing nothing.
// document.fonts.check() answers "would this text render?", not "is this face
// loaded?" — for a family nobody has registered it resolves through the fallback
// stack and says yes. Using it to skip loading meant the face never loaded and
// the annotated text quietly rendered in the system font.
const loaded = new Map<string, string>()

export function useReadingFont(url: string | null | undefined) {
  const [family, setFamily] = useState<string | null>(null)

  useEffect(() => {
    if (!url) { setFamily(null); return }

    let cancelled = false
    const name = `LingoActReading${Math.abs(hash(url))}`

    // Already loaded for this URL from an earlier question in the same lesson.
    if (loaded.has(url)) { setFamily(loaded.get(url) as string); return }

    const face = new FontFace(name, `url(${url}) format("woff2")`)
    face.load()
      .then(() => {
        if (cancelled) return
        document.fonts.add(face)
        loaded.set(url, name)
        setFamily(name)
      })
      .catch(() => { if (!cancelled) setFamily(null) })

    return () => { cancelled = true }
  }, [url])

  return family
}

function hash(value: string) {
  let out = 0
  for (let index = 0; index < value.length; index += 1) {
    out = (out << 5) - out + value.charCodeAt(index)
    out |= 0
  }
  return out
}
