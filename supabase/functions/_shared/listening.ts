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

export type VoicePlan = {
  instruction: string
  speakers: string[]
}

// Two voices is the API's ceiling for a multi-speaker request, and also about
// the point where a learner stops being able to tell characters apart by ear.
const DIALOGUE_VOICES = ['Kore', 'Puck']
const NARRATION_VOICE = 'Kore'

// Named so the model is told which variety to speak rather than left to guess
// from the characters, which for Chinese it cannot do: the same sentence in the
// same script is read differently either side of the strait.
const accentByLanguage: Record<string, string> = {
  'zh-tw': 'Taiwanese Mandarin as spoken in Taiwan, with natural Taiwanese phrasing and intonation',
  en: 'natural English',
  ja: 'natural standard Japanese',
  ko: 'natural standard Korean',
  es: 'natural neutral Spanish',
  fr: 'natural standard French',
  de: 'natural standard German',
  vi: 'natural northern Vietnamese',
}

function accentFor(language: string, script: ChineseScript | null) {
  if (language === 'zh-tw' || language === 'zh-cn') {
    // The teacher's slide is the evidence: a simplified-script passage is
    // almost always mainland material and sounds wrong read in a Taiwan accent,
    // and the reverse is just as jarring to a class in Taipei.
    return script === 'simplified'
      ? 'Standard Mainland Mandarin (Putonghua) with a neutral Beijing-based accent'
      : accentByLanguage['zh-tw']
  }
  return accentByLanguage[language] || 'a natural native accent'
}

export function buildVoicePlan(kind: ClipKind, language: string, script: ChineseScript | null, speakers: string[]): VoicePlan {
  const accent = accentFor(language, script)
  if (kind === 'dialogue' && speakers.length >= 2) {
    return {
      instruction: `Read this conversation in ${accent}. Give each speaker their own consistent voice and let them sound like people talking to each other, not like someone reciting a script. Keep the pace natural for a language learner to follow.`,
      speakers: speakers.slice(0, DIALOGUE_VOICES.length),
    }
  }
  if (kind === 'scene') {
    return {
      instruction: `Describe this in ${accent}, in the warm, clear voice of a teacher introducing a picture to the class. Speak in complete sentences at a pace a learner can follow.`,
      speakers: [],
    }
  }
  return {
    instruction: `Read this passage aloud in ${accent}, clearly and at a pace a language learner can follow, with the phrasing and emphasis a native speaker would use.`,
    speakers: [],
  }
}

function speechConfig(plan: VoicePlan) {
  if (plan.speakers.length >= 2) {
    return {
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: plan.speakers.map((speaker, index) => ({
          speaker,
          voiceConfig: { prebuiltVoiceConfig: { voiceName: DIALOGUE_VOICES[index] } },
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

// Identical words in identical voices produce identical audio, so the hash is
// what stops a teacher paying for the same clip twice.
export async function contentHash(text: string, language: string, script: ChineseScript | null, kind: ClipKind) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode([kind, language, script || '', text].join('\u0000')),
  )
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
