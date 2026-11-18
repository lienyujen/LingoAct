export type InkPoint = { x: number; y: number }
export type Ink = InkPoint[][]

export function hanCharacters(text: string) {
  return [...new Set([...text].filter(character => /\p{Unified_Ideograph}/u.test(character)))]
}

export function moeStrokePracticeUrl(character: string) {
  const query = new URLSearchParams({ ID: String(character.codePointAt(0)), WORD: character, ID2: '1', TP: '0' })
  return `https://stroke-order.learningweb.moe.edu.tw/dictView.jsp?${query}`
}

function distance(a: InkPoint, b: InkPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function normalise(strokes: Ink): Ink {
  const points = strokes.flat()
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  const left = Math.min(...xs), top = Math.min(...ys)
  const width = Math.max(...xs) - left, height = Math.max(...ys) - top
  const scale = Math.max(width, height, 1)
  return strokes.map(stroke => stroke.map(p => ({
    x: (p.x - left - width / 2) / scale,
    y: (p.y - top - height / 2) / scale,
  })))
}

function sample(stroke: InkPoint[]) {
  const lengths = [0]
  for (let i = 1; i < stroke.length; i++) lengths.push(lengths[i - 1] + distance(stroke[i - 1], stroke[i]))
  const total = lengths.at(-1) || 0
  if (!total) return Array<InkPoint>(12).fill(stroke[0])
  let i = 1
  return Array.from({ length: 12 }, (_, n) => {
    const target = total * n / 11
    while (i < lengths.length - 1 && lengths[i] < target) i++
    const t = (target - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1)
    return { x: stroke[i - 1].x + t * (stroke[i].x - stroke[i - 1].x), y: stroke[i - 1].y + t * (stroke[i].y - stroke[i - 1].y) }
  })
}

export function checkHanWriting(ink: Ink, reference: Ink) {
  if (!reference.length || !ink.length || ink.length !== reference.length) return { status: 'count' } as const
  const handwritten = normalise(ink)
  const standard = normalise(reference)
  for (let i = 0; i < standard.length; i++) {
    const a = sample(handwritten[i]), b = sample(standard[i])
    const mean = a.reduce((total, point, j) => total + distance(point, b[j]), 0) / a.length
    if (mean > 0.17 || distance(a[0], b[0]) > 0.26 || distance(a[11], b[11]) > 0.26) {
      return { status: 'stroke', stroke: i + 1 } as const
    }
  }
  // Some look-alikes differ mainly in relative length, such as 未 and 末.
  // Only compare substantial, nearly parallel straight strokes so a dot or
  // a hook is not treated as one of the horizontal bars.
  const bars = standard.map(stroke => {
    const from = stroke[0], to = stroke.at(-1)!
    const length = distance(from, to)
    const arc = stroke.slice(1).reduce((sum, point, i) => sum + distance(point, stroke[i]), 0)
    return { dx: to.x - from.x, dy: to.y - from.y, length, straight: length >= 0.2 && length >= arc * 0.88 }
  })
  for (let i = 0; i < bars.length; i++) for (let j = i + 1; j < bars.length; j++) {
    const a = bars[i], b = bars[j]
    if (!a.straight || !b.straight || Math.abs(a.dx * b.dx + a.dy * b.dy) < a.length * b.length * 0.94) continue
    const expected = a.length - b.length
    if (Math.abs(expected) < 0.12) continue
    const actual = distance(handwritten[i][0], handwritten[i].at(-1)!) - distance(handwritten[j][0], handwritten[j].at(-1)!)
    if (expected * actual <= 0) return { status: 'stroke', stroke: i + 1 } as const
  }
  return { status: 'match' } as const
}
