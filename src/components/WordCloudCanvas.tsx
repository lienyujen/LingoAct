import cloud from 'd3-cloud'
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildTermIndex, mergeTerms } from '../lib/wordCloudTerms'
import type { TermIndex } from '../lib/wordCloudTerms'
import type { Message } from '../types'
import { usePresenterText } from '../lib/presenterI18n'

type CloudWord = {
  text: string
  value: number
  size: number
  x?: number
  y?: number
  rotate?: number
}

const stopWords = new Set([
  '一個', '一些', '一下', '不是', '什麼', '可以', '可能', '因為', '所以', '但是', '如果', '還是', '就是',
  '今天', '現在', '這個', '那個', '這樣', '老師', '同學', '我們', '你們', '他們', '我的', '你的', '他的',
  '的', '了', '是', '在', '有', '我', '你', '他', '她', '也', '都', '很', '和', '與', '嗎', '呢', '啊', '喔',
  'the', 'and', 'that', 'this', 'with', 'from', 'have', 'just', 'very', 'teacher',
])

// Bright enough to read on the near-black stage, and hued around the plum the
// rest of the app now uses rather than the blues it inherited.
const palette = ['#e08ab5', '#e8b45c', '#5fc9c2', '#7fc98f', '#f2eef4', '#b79ad0']

function hashText(text: string) {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededRandom(seed: number) {
  let value = seed || 1
  return () => {
    value += 0x6d2b79f5
    let result = value
    result = Math.imul(result ^ (result >>> 15), result | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

function wordCounts(messages: Message[], index: TermIndex) {
  const segmenter = new Intl.Segmenter('zh-TW', { granularity: 'word' })
  const counts = new Map<string, number>()
  for (const message of messages) {
    // ICU's general dictionary has never heard of the vocabulary a class is
    // about: 華語文 came back as 華語 + 文 and 全美 as 全 + 美, so the cloud
    // showed the halves — the words a teacher is least interested in — and
    // never the term. Runs of adjacent words are stitched back together
    // against the reference list.
    //
    // Only inside an unbroken run: 「教學，設計」is two things a student wrote
    // with a comma between them, not the term 教學設計.
    let run: string[] = []
    const words: string[] = []
    const tally = () => {
      if (!run.length) return
      words.push(...mergeTerms(run, index))
      run = []
    }
    for (const segment of segmenter.segment(message.content)) {
      if (segment.isWordLike) run.push(segment.segment)
      else tally()
    }
    tally()

    // A message that is one word is that word — 可以 on its own is a student
    // answering, not the filler it is mid-sentence, so the stop list does not
    // get to throw it away.
    const wholeMessage = words.length === 1
    for (const merged of words) {
      const word = merged.trim().toLocaleLowerCase('zh-TW')
      if (!word || (/^[a-z\d]$/i.test(word))) continue
      if (!wholeMessage && stopWords.has(word)) continue
      counts.set(word, (counts.get(word) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-TW'))
    .slice(0, 90)
}

export function WordCloudCanvas({ messages, customTerms }: { messages: Message[]; customTerms: string[] }) {
  const t = usePresenterText()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [layoutWords, setLayoutWords] = useState<CloudWord[]>([])
  // Keyed on which messages these are, not on the array that holds them. The
  // page rebuilds that array every five seconds, because the timeline right
  // edge follows the clock — same messages, new array, so counts changed
  // identity, the effect below re-ran and its cleanup called layout.stop().
  // d3-cloud places ninety words over several seconds, so a restart every five
  // meant it rarely reached the end and the cloud stayed empty while the words
  // were being counted perfectly well.
  const messageKey = messages.map((message) => message.id).join(",")
  // Built from the terms rather than read here, so it changes only when the
  // presenter saves a word — and one added mid-class takes effect on the next
  // message rather than needing the window reopened.
  const termIndex = useMemo(() => buildTermIndex(customTerms), [customTerms])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- messageKey IS the identity of messages
  const counts = useMemo(() => wordCounts(messages, termIndex), [messageKey, termIndex])

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) })
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!size.width || !size.height || !counts.length) {
      setLayoutWords([])
      return
    }
    const maximum = counts[0]?.[1] || 1
    const minimum = counts.at(-1)?.[1] || 1
    const seed = counts.reduce((total, [word, count]) => total ^ hashText(`${word}:${count}`), 0)
    const words: CloudWord[] = counts.map(([text, value]) => {
      const ratio = maximum === minimum ? 0.6 : (value - minimum) / (maximum - minimum)
      return { text, value, size: Math.round(20 + Math.sqrt(ratio) * 70) }
    })
    const layout = cloud<CloudWord>()
      .size([size.width, size.height])
      .words(words)
      .padding((word) => word.size > 58 ? 8 : 5)
      .rotate(0)
      .font('"Segoe UI Variable Text", "Segoe UI", Noto Sans TC, Microsoft JhengHei, sans-serif')
      .fontWeight((word) => word.size > 48 ? 800 : 700)
      .fontSize((word) => word.size)
      .random(seededRandom(seed))
      .spiral('archimedean')
      .on('end', (placed) => setLayoutWords(placed))
    layout.start()
    return () => {
      layout.stop()
    }
  }, [counts, size.height, size.width])

  return (
    <div className="word-cloud-canvas" ref={containerRef}>
      {!messages.length && <p className="word-cloud-empty">{t('waitingFirstMessage')}</p>}
      {messages.length > 0 && !counts.length && <p className="word-cloud-empty">{t('buildingKeywords')}</p>}
      {layoutWords.map((word) => (
        <span
          className="word-cloud-word"
          key={word.text}
          style={{
            color: palette[hashText(word.text) % palette.length],
            fontSize: word.size,
            left: '50%',
            top: '50%',
            transform: `translate(${word.x || 0}px, ${word.y || 0}px) translate(-50%, -50%)`,
          }}
          title={t('wordTimes', { word: word.text, n: word.value })}
        >
          {word.text}
        </span>
      ))}
    </div>
  )
}
