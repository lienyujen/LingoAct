export function extractMoeStrokeXml(html: string, character: string): string | null {
  const code = character.codePointAt(0)
  if (!code || !/^\p{Unified_Ideograph}$/u.test(character)) return null
  // The official practice page includes the original XML as a JS string.
  // Decode the string literal, never execute the surrounding script.
  const match = html.match(new RegExp('xml\\[' + code + '\\]=("(?:[^"\\\\]|\\\\[\\s\\S])*")'))
  if (!match) return null
  try {
    const xml: string = JSON.parse(match[1])
    return xml.includes(`<Word version="1.0" unicode="${character}">`) && xml.length <= 250_000 ? xml : null
  } catch { return null }
}

// Only read the numeric trajectory coordinates. Outlines and markup never
// enter the renderer used to show the learner's submitted strokes.
export function parseMoeStrokeTracks(xml: string) {
  return [...xml.matchAll(/<Track>([\s\S]*?)<\/Track>/g)].map(([, section]) =>
    [...section.matchAll(/\bx="([\d.]+)"\s+y="([\d.]+)"/g)].map(([, x, y]) => ({ x: Number(x), y: Number(y) })))
}
