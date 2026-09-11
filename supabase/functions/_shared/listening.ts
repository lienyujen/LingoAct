// Turning a passage into something a class can listen to.
//
// Gemini returns raw signed 16-bit PCM, not a container format, so nothing can
// play it until a RIFF header is put in front. Everything else here is about
// choosing how it should sound: a dialogue read in one flat voice teaches a
// learner far less than two voices taking turns.

const SAMPLE_RATE = 24000
const CHANNELS = 1
const BITS = 16

export type ClipKind = 'passage' | 'dialogue' | 'scene'
export type ChineseScript = 'traditional' | 'simplified'
export type ChineseAccent = 'standard_guoyu' | 'putonghua' | 'taiwanese'
export type SpeakerGender = 'male' | 'female' | 'boy' | 'girl' | 'unknown'

export type VoicePlan = {
  instruction: string
  speakers: string[]
  voiceNames: string[]
}

export type KaraokeCue = {
  start_index: number
  end_index: number
  start_ms: number
  end_ms: number
}

// Two voices is the API's ceiling for a multi-speaker request, and also about
// the point where a learner stops being able to tell characters apart by ear.
const NARRATION_VOICE = 'Kore'
const FEMALE_VOICES = ['Kore', 'Aoede']
const MALE_VOICES = ['Orus', 'Gacrux']
const BOY_VOICES = ['Puck', 'Fenrir']
const GIRL_VOICES = ['Leda', 'Zephyr']

// Named so the model is told which variety to speak rather than left to guess
// from the characters, which for Chinese it cannot do: the same sentence in the
// same script is read differently either side of the strait.
const accentByLanguage: Record<string, string> = {
  en: 'natural English',
  ja: 'natural standard Japanese',
  ko: 'natural standard Korean',
  es: 'natural neutral Spanish',
  fr: 'natural standard French',
  de: 'natural standard German',
  vi: 'natural northern Vietnamese',
}

function accentFor(language: string, accent: ChineseAccent | null) {
  if (language === 'zh-tw' || language === 'zh-cn') {
    if (accent === 'putonghua') {
      return 'standard Putonghua (普通話) as defined and taught in Mainland China, with neutral standard pronunciation, accurate retroflex initials and erhua only where standard Putonghua calls for it; do not use Taiwanese Mandarin pronunciation or vocabulary'
    }
    if (accent === 'taiwanese') {
      return 'natural Taiwanese Mandarin as spoken in Taiwan, with recognisably Taiwanese pronunciation, phrasing and intonation'
    }
    return 'Standard Guoyu (標準國語) as taught and used in formal broadcasting in Taiwan, with neutral careful diction and accurate tones; avoid strongly local Taiwanese Mandarin pronunciation, slang or exaggerated Taiwan-style intonation'
  }
  return accentByLanguage[language] || 'a natural native accent'
}

function assignedGender(gender: SpeakerGender | undefined, index: number): Exclude<SpeakerGender, 'unknown'> {
  if (gender && gender !== 'unknown') return gender
  return index % 2 === 0 ? 'female' : 'male'
}

function voiceDescription(voice: Exclude<SpeakerGender, 'unknown'>) {
  if (voice === 'boy') return 'youthful male voice'
  if (voice === 'girl') return 'youthful female voice'
  return voice === 'male' ? 'adult male' : 'adult female'
}

export function buildVoicePlan(
  kind: ClipKind,
  language: string,
  accentChoice: ChineseAccent | null,
  speakers: string[],
  speakerGenders: SpeakerGender[] = [],
): VoicePlan {
  const accent = accentFor(language, accentChoice)
  if (kind === 'dialogue' && speakers.length >= 2) {
    const used = { female: 0, male: 0, boy: 0, girl: 0 }
    const assignments = speakers.slice(0, 2).map((speaker, index) => {
      const gender = assignedGender(speakerGenders[index], index)
      const choices = gender === 'female' ? FEMALE_VOICES
        : gender === 'male' ? MALE_VOICES
          : gender === 'boy' ? BOY_VOICES : GIRL_VOICES
      const voiceName = choices[used[gender]++ % choices.length]
      return { speaker, gender, voiceName }
    })
    return {
      instruction: [
        `Read this conversation in ${accent}.`,
        assignments.map(({ speaker, gender }) => `${speaker} must use a clearly ${voiceDescription(gender)} voice.`).join(' '),
        'Keep each assigned voice consistent. Let them sound like people talking to each other, not like one narrator reciting a script. Keep the pace natural for a language learner to follow.',
      ].join(' '),
      speakers: assignments.map(({ speaker }) => speaker),
      voiceNames: assignments.map(({ voiceName }) => voiceName),
    }
  }
  if (kind === 'scene') {
    return {
      instruction: `Describe this in ${accent}, in the warm, clear voice of a teacher introducing a picture to the class. Speak in complete sentences at a pace a learner can follow.`,
      speakers: [],
      voiceNames: [],
    }
  }
  return {
    instruction: `Read this passage aloud in ${accent}, clearly and at a pace a language learner can follow, with the phrasing and emphasis a native speaker would use.`,
    speakers: [],
    voiceNames: [],
  }
}

function speechConfig(plan: VoicePlan) {
  if (plan.speakers.length >= 2) {
    return {
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: plan.speakers.map((speaker, index) => ({
          speaker,
          voiceConfig: { prebuiltVoiceConfig: { voiceName: plan.voiceNames[index] } },
        })),
      },
    }
  }
  return { voiceConfig: { prebuiltVoiceConfig: { voiceName: NARRATION_VOICE } } }
}

function ttsModels() {
  const primary = Deno.env.get('GEMINI_TTS_MODEL') || 'gemini-3.1-flash-tts-preview'
  const fallback = Deno.env.get('GEMINI_TTS_FALLBACK_MODEL') || 'gemini-2.5-flash-preview-tts'
  return [primary, fallback]
}

export async function synthesize(text: string, plan: VoicePlan) {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.')

  const body = JSON.stringify({
    contents: [{ parts: [{ text: `${plan.instruction}\n\n${text}` }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: speechConfig(plan) },
  })

  let failure = 'Speech synthesis failed.'
  for (const [index, model] of ttsModels().entries()) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
          body,
          // Synthesis is slower than a text turn and the gateway kills the whole
          // function at roughly 76 seconds, so the first attempt gets the larger
          // share and the fallback only what is left.
          signal: AbortSignal.timeout(index === 0 ? 45_000 : 20_000),
        },
      )
      if (response.ok) {
        const payload = await response.json()
        const inline = payload?.candidates?.[0]?.content?.parts?.find((part: { inlineData?: unknown }) => part.inlineData)?.inlineData
        if (!inline?.data) throw new Error('The model returned no audio.')
        return decodeBase64(inline.data as string)
      }
      failure = (await response.text()).slice(0, 500) || `Speech synthesis failed with status ${response.status}.`
    } catch (error) {
      failure = error instanceof Error ? error.message : failure
    }
  }
  throw new Error(failure)
}

function decodeBase64(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

// A 44-byte RIFF header in front of the samples is the whole difference between
// bytes the browser refuses and audio a student can press play on.
export function wavFromPcm(pcm: Uint8Array) {
  const blockAlign = (CHANNELS * BITS) / 8
  const byteRate = SAMPLE_RATE * blockAlign
  const buffer = new ArrayBuffer(44 + pcm.length)
  const view = new DataView(buffer)
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index))
  }

  ascii(0, 'RIFF')
  view.setUint32(4, 36 + pcm.length, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, CHANNELS, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, BITS, true)
  ascii(36, 'data')
  view.setUint32(40, pcm.length, true)
  new Uint8Array(buffer, 44).set(pcm)
  return new Uint8Array(buffer)
}

export function durationMs(pcmLength: number) {
  return Math.round((pcmLength / ((SAMPLE_RATE * CHANNELS * BITS) / 8)) * 1000)
}

// The transcriber is called once while the WAV is being created. Students only
// read the saved cue list, so replaying — including after class — spends no AI
// quota. If timestamping is unavailable, the recording still ships with a
// conservative duration-based alignment instead of making synthesis fail.
export async function karaokeCues(wav: Uint8Array, transcript: string, language: string, totalMs: number): Promise<KaraokeCue[]> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (apiKey) {
    try {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemini-3.5-transcribe',
          input: [{ type: 'audio', data: encodeBase64(wav), mime_type: 'audio/wav' }],
          generation_config: {
            transcription_config: {
              language_codes: [language],
              mode: { type: 'verbatim', timestamp_granularities: ['word'] },
            },
          },
        }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error((await response.text()).slice(0, 400))
      const aligned = alignWordInfo(await response.json(), transcript, language)
      const completed = completeCues(aligned, transcript, totalMs, language)
      if (completed.length) return completed
    } catch (error) {
      console.warn('word timestamping unavailable; using duration alignment', error instanceof Error ? error.message : error)
    }
  }
  return fallbackCues(transcript, totalMs, language)
}

function encodeBase64(bytes: Uint8Array) {
  let binary = ''
  const chunk = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))
  }
  return btoa(binary)
}

function seconds(value: unknown) {
  if (typeof value !== 'string') return null
  const parsed = Number(value.replace(/s$/, ''))
  return Number.isFinite(parsed) ? Math.round(parsed * 1000) : null
}

function collectWordInfo(value: unknown, out: Array<{ text: string; start: number; end: number }> = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectWordInfo(item, out)
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (record.type === 'word_info' && typeof record.text === 'string') {
      const start = seconds(record.start_offset)
      const end = seconds(record.end_offset)
      if (start !== null && end !== null && end > start) out.push({ text: record.text, start, end })
    }
    for (const child of Object.values(record)) collectWordInfo(child, out)
  }
  return out
}

function searchable(text: string) {
  const value: string[] = []
  const indexes: number[] = []
  ;[...text].forEach((character, index) => {
    for (const normalized of [...character.normalize('NFKC').toLocaleLowerCase()]) {
      if (/\p{L}|\p{N}/u.test(normalized)) {
        value.push(normalized)
        indexes.push(index)
      }
    }
  })
  return { value: value.join(''), indexes }
}

function alignWordInfo(payload: unknown, transcript: string, language: string) {
  const haystack = searchable(transcript)
  let cursor = 0
  const cues: KaraokeCue[] = []
  for (const word of collectWordInfo(payload)) {
    const needle = searchable(word.text).value
    if (!needle) continue
    const found = haystack.value.indexOf(needle, cursor)
    if (found < 0) continue
    const startIndex = haystack.indexes[found]
    const endIndex = (haystack.indexes[found + needle.length - 1] ?? startIndex) + 1
    const cue = { start_index: startIndex, end_index: endIndex, start_ms: word.start, end_ms: word.end }
    cues.push(...splitChineseCue(cue, transcript, language))
    cursor = found + needle.length
  }
  return cues
}

function splitChineseCue(cue: KaraokeCue, transcript: string, language: string) {
  if (!language.toLowerCase().startsWith('zh')) return [cue]
  const indexes = [...transcript].slice(cue.start_index, cue.end_index)
    .map((character, offset) => /\p{L}|\p{N}/u.test(character) ? cue.start_index + offset : -1)
    .filter((index) => index >= 0)
  if (indexes.length < 2) return [cue]
  const width = (cue.end_ms - cue.start_ms) / indexes.length
  return indexes.map((index, offset) => ({
    start_index: index,
    end_index: index + 1,
    start_ms: Math.round(cue.start_ms + width * offset),
    end_ms: Math.round(cue.start_ms + width * (offset + 1)),
  }))
}

function fallbackCues(transcript: string, totalMs: number, language: string) {
  const matcher = language.toLowerCase().startsWith('zh')
    ? /[\p{L}\p{N}]/gu
    : /[\p{L}\p{N}]+/gu
  const tokens = [...transcript.matchAll(matcher)].filter((token) => !isSpeakerLabel(transcript, token.index, token[0].length))
  if (!tokens.length) return []
  const startPad = Math.min(350, totalMs * .04)
  const usable = Math.max(totalMs - startPad - Math.min(450, totalMs * .05), tokens.length * 40)
  const weight = tokens.reduce((sum, token) => sum + [...token[0]].length, 0)
  let elapsed = startPad
  return tokens.map((token) => {
    const length = [...token[0]].length
    const span = usable * length / weight
    const cue = {
      start_index: [...transcript.slice(0, token.index)].length,
      end_index: [...transcript.slice(0, token.index + token[0].length)].length,
      start_ms: Math.round(elapsed),
      end_ms: Math.round(elapsed + span),
    }
    elapsed += span
    return cue
  })
}

function isSpeakerLabel(text: string, start: number, length: number) {
  const lineStart = Math.max(text.lastIndexOf('\n', start - 1) + 1, 0)
  if (text.slice(lineStart, start).trim()) return false
  return /^\s*[:：]/u.test(text.slice(start + length))
}

// ASR occasionally omits a short particle or recognises a homophone. Its
// timestamps are still the best anchors available, but a KTV line with dark
// holes is worse than an interpolated syllable. Fill only those holes between
// neighbouring real timestamps; recognised words keep their measured times.
function completeCues(measured: KaraokeCue[], transcript: string, totalMs: number, language: string) {
  if (!measured.length) return fallbackCues(transcript, totalMs, language)
  const expected = fallbackCues(transcript, totalMs, language)
  const bySpan = new Map(measured.map((cue) => [`${cue.start_index}:${cue.end_index}`, cue]))
  const result: Array<KaraokeCue | null> = expected.map((cue) => bySpan.get(`${cue.start_index}:${cue.end_index}`) || null)

  for (let start = 0; start < result.length;) {
    if (result[start]) { start += 1; continue }
    let end = start + 1
    while (end < result.length && !result[end]) end += 1
    const lower = start > 0 ? (result[start - 1] as KaraokeCue).end_ms : 0
    const upper = end < result.length ? (result[end] as KaraokeCue).start_ms : totalMs
    const width = Math.max(upper - lower, end - start) / (end - start)
    for (let index = start; index < end; index += 1) {
      result[index] = {
        ...expected[index],
        start_ms: Math.round(lower + width * (index - start)),
        end_ms: Math.round(lower + width * (index - start + 1)),
      }
    }
    start = end
  }
  return result.filter((cue): cue is KaraokeCue => Boolean(cue))
}

// Identical words in identical voices produce identical audio, so the hash is
// what stops a teacher paying for the same clip twice.
export async function contentHash(
  text: string,
  language: string,
  accent: ChineseAccent | null,
  kind: ClipKind,
  speakers: string[] = [],
  speakerGenders: SpeakerGender[] = [],
) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode([kind, language, accent || '', speakers.join('|'), speakerGenders.join('|'), text].join('\u0000')),
  )
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
