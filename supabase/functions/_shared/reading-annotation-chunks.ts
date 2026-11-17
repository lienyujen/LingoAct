// Prefer sentence boundaries and preserve every code point, including spaces.
export function readingAnnotationChunks(text: string, size = 160) {
  const characters = [...text], chunks: string[] = []
  for (let start = 0; start < characters.length;) {
    let end = Math.min(start + size, characters.length)
    if (end < characters.length) {
      for (let at = end - 1; at >= start + Math.floor(size / 2); at--) {
        if (/[。！？\n]/u.test(characters[at])) { end = at + 1; break }
      }
    }
    chunks.push(characters.slice(start, end).join('')); start = end
  }
  return chunks
}

export async function annotateReadingChunks<T>(text: string, annotate: (text: string, context: { preceding_context: string; following_context: string }) => Promise<T>) {
  const chunks = readingAnnotationChunks(text)
  const results: T[] = []
  // Two calls at a time bounds cost spikes and keeps long prose below one
  // monolithic response's timeout. The caller publishes only after all succeed.
  for (let at = 0; at < chunks.length; at += 2) {
    results.push(...await Promise.all(chunks.slice(at, at + 2).map((chunk, offset) => annotate(chunk, {
      preceding_context: chunks[at + offset - 1]?.slice(-120) || '',
      following_context: chunks[at + offset + 1]?.slice(0, 120) || '',
    }))))
  }
  return results
}
