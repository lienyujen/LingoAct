import fs from 'node:fs'

const translated = fs.existsSync('scripts/sc-ui-english.json') ? JSON.parse(fs.readFileSync('scripts/sc-ui-english.json', 'utf8')) : {}
const strings = JSON.parse(fs.readFileSync('scripts/sc-ui-source.json', 'utf8')).filter((text) => !translated[text])
const env = fs.readFileSync('supabase/.env', 'utf8')
const key = env.split(/\r?\n/).find((line) => line.startsWith('GEMINI_API_KEY='))?.slice(15).trim().replace(/^['"]|['"]$/g, '')
if (!key || key.startsWith('your-')) throw new Error('A configured Gemini key is required; no credentials were printed.')
for (let offset = 0; offset < strings.length; offset += 100) {
  const batch = Object.fromEntries(strings.slice(offset, offset + 100).map((text, index) => [String(offset + index), text]))
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent', {
    method: 'POST', signal: AbortSignal.timeout(60_000),
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: 'Translate this classroom software UI catalogue into concise, natural English. Return every numbered key as a JSON object. Preserve punctuation, spaces, placeholders, HSK, TBCL, TOCFL, API identifiers and product names. Keep Chinese text inside example quotes when it is teaching material, rather than translating the example itself. Do not add explanations.\n' + JSON.stringify(batch) }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } }),
  })
  if (!response.ok) throw new Error(`UI translation returned HTTP ${response.status}; response body withheld to protect credentials.`)
  const payload = await response.json()
  const result = JSON.parse(payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '{}')
  for (const [id, text] of Object.entries(batch)) {
    if (typeof result[id] !== 'string') throw new Error(`Missing UI translation ${id}`)
    translated[text] = result[id]
  }
  fs.writeFileSync('scripts/sc-ui-english.json', JSON.stringify(translated, null, 2) + '\n')
  console.log(`Translated ${Object.keys(translated).length}/${strings.length} UI labels`)
}
