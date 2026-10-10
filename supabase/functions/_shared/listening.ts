import { regionalPronunciationInstruction, regionalSpeechText } from './mandarin-pronunciation.ts'
import { speechAccent, englishPronunciationInstruction } from './speech-accent.ts'
import type { SpeechAccent } from './speech-accent.ts'

// Turning a passage into something a class can listen to.
//
// Gemini returns raw signed 16-bit PCM, not a container format, so nothing can
// play it until a RIFF header is put in front. Everything else here is about
// choosing how it should sound: a dialogue read in one flat voice teaches a
// learner far less than two voices taking turns.

const SAMPLE_RATE = 24000
const CHANNELS = 1
const BITS = 16
const SPEECH_RECIPE_VERSION = 'gemini-3.8-regional-mandarin-v3'

export type ClipKind = 'passage' | 'dialogue' | 'scene'
export type ChineseScript = 'traditional' | 'simplified'
export type ChineseAccent = 'standard_guoyu' | 'putonghua' | 'taiwanese'
export type SpeakerGender = 'male' | 'female' | 'boy' | 'girl' | 'unknown'

export type VoicePlan = {
  instruction: string
  speakers: string[]
  voiceNames: string[]
  speechText: string
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

function accentFor(language: string, accent: SpeechAccent | null) {
  if (language === 'en' || language.startsWith('en-')) return accent === 'british' ? 'standard British English' : 'General American English'
  if (language === 'zh-tw' || language === 'zh-cn') {
    if (accent === 'putonghua') {
      return 'standard Putonghua (普通話) as defined and taught in Mainland China, with neutral standard pronunciation, accurate retroflex initials and erhua only where standard Putonghua calls for it; do not use Taiwanese Mandarin pronunciation or vocabulary'
    }
    if (accent === 'taiwanese') {
      return 'authentic contemporary Taiwanese Mandarin as naturally spoken in Taiwan, with unmistakably Taiwanese cadence, rhythm, phrasing and intonation, while keeping official Taiwan Ministry of Education lexical readings and tones'
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
  accentChoice: SpeechAccent | null,
  speakers: string[],
  speakerGenders: SpeakerGender[] = [],
  text = '',
): VoicePlan {
  accentChoice = speechAccent(language, accentChoice)
  const mandarinAccent = speechAccent(language.startsWith('zh') ? language : 'zh-tw', accentChoice) as ChineseAccent
  const accent = accentFor(language, accentChoice)
  const pronunciation = language === 'zh-cn' ? 'Use standard Mainland Putonghua. Do not use Taiwan pronunciation or cross-strait vocabulary substitutions.'
    : language.startsWith('zh') ? regionalPronunciationInstruction(text, mandarinAccent)
      : language.startsWith('en') ? englishPronunciationInstruction(accentChoice === 'british' ? 'british' : 'american') : ''
  let speechText = language.startsWith('zh') && language !== 'zh-cn' ? regionalSpeechText(text, mandarinAccent) : text
  if (kind === 'dialogue' && speakers.length >= 2) {
    if (language.startsWith('zh') && language !== 'zh-cn') {
      const labels = new Set(speakers.slice(0, 2).map((speaker) => speaker.trim()))
      // Pronunciation substitutes belong only to speech. Changing a name in
      // the silent label would stop it matching its assigned voice.
      speechText = text.replace(/[^\r\n]+/gu, (line) => {
        const match = line.match(/^(\s*([^：:]{1,30})[：:]\s*)(.*)$/u)
        return match && labels.has(match[2].trim())
          ? match[1] + regionalSpeechText(match[3], mandarinAccent)
          : regionalSpeechText(line, mandarinAccent)
      })
    }
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
        pronunciation,
      ].filter(Boolean).join(' '),
      speakers: assignments.map(({ speaker }) => speaker),
      voiceNames: assignments.map(({ voiceName }) => voiceName),
      speechText,
    }
  }
  if (kind === 'scene') {
    return {
      instruction: [`Describe this in ${accent}, in the warm, clear voice of a teacher introducing a picture to the class. Speak in complete sentences at a pace a learner can follow.`, pronunciation].filter(Boolean).join(' '),
      speakers: [],
      voiceNames: [],
      speechText,
    }
  }
  return {
    instruction: [`Read this passage aloud in ${accent}, clearly and at a pace a language learner can follow, with the phrasing and emphasis a native speaker would use.`, pronunciation].filter(Boolean).join(' '),
    speakers: [],
    voiceNames: [],
    speechText,
  }
}

function speechConfig(plan: VoicePlan) {
  if (plan.speakers.length >= 2) {
    return {
      mode: 'conversational',
      speakers: plan.speakers.map((speaker, index) => ({ speaker, voice: plan.voiceNames[index] })),
    }
  }
  return [{ voice: NARRATION_VOICE }]
}

function ttsModels() {
  const primary = Deno.env.get('GEMINI_TTS_MODEL') || 'gemini-3.8-flash-tts'
  const fallback = Deno.env.get('GEMINI_TTS_FALLBACK_MODEL') || 'gemini-3.8-flash-lite-tts'
  return [primary, fallback]
}

export function dialogueTurns(text: string, speakers: string[]) {
  const labels = new Set(speakers.map((speaker) => speaker.trim()))
  return text.split(/\r?\n/u).map((line) => {
    const match = line.match(/^\s*([^：:]{1,30})\s*[：:]\s*(.*)$/u)
    const speaker = match && labels.has(match[1].trim()) ? match[1].trim() : null
    return { speaker, text: speaker ? match![2].trim() : line.trim() }
  })
}

function withoutSpeakerLabels(text: string, speakers: string[]) {
  const labels = new Set(speakers.map((speaker) => speaker.trim()))
  // Spaces preserve character offsets for the displayed script. Only the
  // recognised label is silent; the same name inside a turn is spoken.
  return text.replace(/^([^\S\r\n]*)([^：:\r\n]{1,30})[：:]/gmu, (label, _space, name) => (
    labels.has(name.trim()) ? ' '.repeat([...label].length) : label
  ))
}

function interactionContent(plan: VoicePlan, fallbackText: string) {
  const speechText = plan.speechText || fallbackText
  if (plan.speakers.length < 2) {
    return [{
      type: 'text',
      text: speechText,
      annotations: [{ type: 'speech_metadata', style: plan.instruction }],
    }]
  }

  const speakerLookup = new Map(plan.speakers.map((speaker) => [speaker.trim(), speaker]))
  let alternate = 0
  return dialogueTurns(speechText, plan.speakers).filter((turn) => turn.text).map((turn) => {
    const named = turn.speaker ? speakerLookup.get(turn.speaker) : undefined
    const speaker = named || plan.speakers[alternate++ % plan.speakers.length]
    return {
      type: 'text',
      // Speaker labels are metadata, not words in the recording. Gemini 3.8
      // treats every character in this field as a verbatim transcript.
      text: turn.text,
      annotations: [{ type: 'speech_metadata', speaker, style: plan.instruction }],
    }
  })
}

export async function synthesize(text: string, plan: VoicePlan) {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.')

  let failure = 'Speech synthesis failed.'
  for (const [index, model] of ttsModels().entries()) {
    try {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
          method: 'POST',
          headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            input: [{ type: 'user_input', content: interactionContent(plan, text) }],
            response_format: { type: 'audio', mime_type: 'audio/l16', sample_rate: SAMPLE_RATE },
            generation_config: { speech_config: speechConfig(plan) },
          }),
          // Synthesis is slower than a text turn and the gateway kills the whole
          // function at roughly 76 seconds, so the first attempt gets the larger
          // share and the fallback only what is left.
          signal: AbortSignal.timeout(index === 0 ? 45_000 : 20_000),
        })
      if (response.ok) {
        const payload = await response.json()
        const audio = (payload?.steps || []).flatMap((step: { content?: unknown[] }) => step.content || [])
          .filter((part: { type?: string; data?: string }) => part.type === 'audio' && part.data)
          .at(-1)
        if (!audio?.data) throw new Error('The model returned no audio.')
        return decodeBase64(audio.data as string)
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
export async function karaokeCues(
  wav: Uint8Array,
  transcript: string,
  language: string,
  totalMs: number,
  spokenTranscript = transcript,
  speakers: string[] = [],
): Promise<KaraokeCue[]> {
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
      const payload = await response.json()
      const words = collectWordInfo(payload)
      if (words.length) {
        const expectedText = dialogueTurns(spokenTranscript, speakers).map((turn) => turn.text).join('\n')
        const expected = searchable(expectedText).value.length
        const heard = words.reduce((length, word) => length + searchable(word.text).value.length, 0)
        // ASR may contract words or spell names differently even when the
        // recording is intact. Timestamping cannot veto already-created audio.
        if (expected && heard / expected < 0.98) {
          console.warn(`Speech transcription covered ${heard} of ${expected} characters; retaining the requested text.`)
          if (heard / expected < 0.5) return fallbackCues(withoutSpeakerLabels(transcript, speakers), totalMs, language)
        }
      }
      const cueTranscript = withoutSpeakerLabels(spokenTranscript, speakers)
      const aligned = alignWordInfo(payload, cueTranscript, language, totalMs)
      const completed = completeCues(aligned, cueTranscript, totalMs, language)
      if (completed.length) return completed
    } catch (error) {
      console.warn('word timestamping unavailable; using duration alignment', error instanceof Error ? error.message : error)
    }
  }
  return fallbackCues(withoutSpeakerLabels(transcript, speakers), totalMs, language)
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

// Which occurrence of a repeated word is the one being spoken.
//
// 檔案 appears five times in one passage about files. Taking the first match
// at or after the cursor is right until a word is mis-transcribed and skipped:
// the next word then matches a LATER repeat, and from there every cue sits
// several lines ahead of the voice and never recovers — which is what a
// teacher sees as the highlight jumping and never coming back.
//
// The clock says which one. A word spoken a third of the way through a clip
// belongs about a third of the way through the text, so the candidate nearest
// that estimate wins, and one too far from it is dropped rather than guessed
// at. A gap left behind is interpolated below, which is a small error in the
// right place instead of a large one in the wrong place.
function expectedIndex(startMs: number, totalMs: number, length: number) {
  if (!totalMs || !Number.isFinite(startMs)) return null
  return Math.round((Math.min(Math.max(startMs, 0), totalMs) / totalMs) * length)
}

function alignWordInfo(payload: unknown, transcript: string, language: string, totalMs: number) {
  const haystack = searchable(transcript)
  // Speech is not evenly paced, so this has to tolerate real drift while still
  // rejecting a repeat a few lines away.
  // Tight on purpose. A rejected anchor costs precision — the stretch is
  // interpolated between its neighbours instead of measured — and a wrong one
  // costs the whole rest of the passage, because the highlight races to it and
  // then stalls. 8% of a 200-character passage is sixteen characters, about
  // half a line, which is far more drift than speech actually has.
  const tolerance = Math.max(12, Math.round(haystack.value.length * 0.08))
  let cursor = 0
  const cues: KaraokeCue[] = []
  for (const word of collectWordInfo(payload)) {
    const needle = searchable(word.text).value
    if (!needle) continue

    const expected = expectedIndex(word.start, totalMs, haystack.value.length)
    let found = -1
    for (let at = haystack.value.indexOf(needle, cursor); at >= 0; at = haystack.value.indexOf(needle, at + 1)) {
      if (expected === null) { found = at; break }
      if (found < 0 || Math.abs(at - expected) < Math.abs(found - expected)) found = at
      // Past the estimate there is nothing nearer to find.
      if (at > expected) break
    }
    if (found < 0) continue
    if (expected !== null && Math.abs(found - expected) > tolerance) continue

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

// Milliseconds per character, as measured between the first and last anchor.
// Falling back to the file's duration is only for a clip with a single anchor,
// where there is nothing to measure a rate from.
function measuredPace(result: Array<KaraokeCue | null>, totalMs: number) {
  const first = result.findIndex(Boolean)
  const last = result.findLastIndex(Boolean)
  if (first < 0 || last <= first) return totalMs / Math.max(result.length, 1)
  const span = (result[last] as KaraokeCue).end_ms - (result[first] as KaraokeCue).start_ms
  return span / (last - first + 1)
}

function fallbackCues(transcript: string, totalMs: number, language: string) {
  const matcher = language.toLowerCase().startsWith('zh')
    ? /[\p{L}\p{N}]/gu
    : /[\p{L}\p{N}]+/gu
  const tokens = [...transcript.matchAll(matcher)]
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

// ASR occasionally omits a short particle or recognises a homophone. Its
// timestamps are still the best anchors available, but a KTV line with dark
// holes is worse than an interpolated syllable. Fill only those holes between
// neighbouring real timestamps; recognised words keep their measured times.
function completeCues(input: KaraokeCue[], transcript: string, totalMs: number, language: string) {
  if (!input.length) return fallbackCues(transcript, totalMs, language)
  const expected = fallbackCues(transcript, totalMs, language)
  const bySpan = new Map(input.map((cue) => [`${cue.start_index}:${cue.end_index}`, cue]))
  const result: Array<KaraokeCue | null> = expected.map((cue) => bySpan.get(`${cue.start_index}:${cue.end_index}`) || null)

  // Anchors have to run forward in POSITION and in TIME together.
  //
  // Checking them in the order the transcriber returned them proves nothing,
  // because that order is already time order. This array is the one that
  // matters: it is in reading order, so a word matched to the wrong place sits
  // at an index whose time belongs somewhere else, and the player — which
  // takes the first cue whose window holds the current moment — jumps to it.
  // Dropping the anchor leaves a gap the interpolation below fills, which is a
  // small error where the voice actually is instead of a large one lines away.
  let lastAnchor = -1
  let kept = 0
  let dropped = 0
  for (let index = 0; index < result.length; index += 1) {
    const cue = result[index]
    if (!cue) continue
    if (cue.start_ms < lastAnchor) { result[index] = null; dropped += 1; continue }
    lastAnchor = cue.start_ms
    kept += 1
  }

  if (!kept) return expected
  if (dropped) console.warn(`Karaoke alignment: dropped ${dropped} of ${kept + dropped} anchors that ran backwards.`)

  const pace = measuredPace(result, totalMs)
  for (let start = 0; start < result.length;) {
    if (result[start]) { start += 1; continue }
    let end = start + 1
    while (end < result.length && !result[end]) end += 1
    // The clip is longer than the speech in it. A recording ends with a beat
    // of silence, and the transcriber often gives up on the last few
    // characters as the voice trails off — so the final run of unmeasured
    // characters is exactly where stretching to the end of the FILE spreads a
    // couple of syllables over seconds of nothing. That is the highlight
    // crawling through the last two sentences while the speaker has already
    // finished them.
    //
    // The anchors already say how fast this person talks. Pace the two edges
    // at that rate instead of against the file's duration, and the ending
    // lands with the voice.
    const lower = start > 0
      ? (result[start - 1] as KaraokeCue).end_ms
      : Math.max(0, (end < result.length ? (result[end] as KaraokeCue).start_ms : totalMs) - pace * (end - start))
    const upper = end < result.length
      ? (result[end] as KaraokeCue).start_ms
      : Math.min(totalMs, lower + pace * (end - start))
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

  // Whatever happened above, the finished timeline only moves forward. The
  // player walks it with findIndex, so one cue out of order is one jump.
  const cues = result.filter((cue): cue is KaraokeCue => Boolean(cue))
  let floor = 0
  for (const cue of cues) {
    cue.start_ms = Math.max(cue.start_ms, floor)
    cue.end_ms = Math.max(cue.end_ms, cue.start_ms)
    floor = cue.start_ms
  }
  return cues
}

// Identical words in identical voices produce identical audio, so the hash is
// what stops a teacher paying for the same clip twice.
export async function contentHash(
  text: string,
  language: string,
  accent: SpeechAccent | null,
  kind: ClipKind,
  speakers: string[] = [],
  speakerGenders: SpeakerGender[] = [],
) {
  const plan = buildVoicePlan(kind, language, accent, speakers, speakerGenders, text)
  const parts = [
    SPEECH_RECIPE_VERSION, kind, language, accent || '', speakers.join('|'),
    speakerGenders.join('|'), text, plan.instruction, plan.speechText,
  ]
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(parts.join('\u0000')),
  )
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
