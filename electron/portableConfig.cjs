const fs = require('node:fs')
const path = require('node:path')

const keys = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_PUBLIC_APP_URL']

function parsePublicConfig(text) {
  const values = {}
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*?)\s*$/)
    if (!match || !keys.includes(match[1])) continue
    const raw = match[2]
    const quoted = raw.match(/^(["'])(.*?)\1\s*(?:#.*)?$/)
    if (/^["']/.test(raw) && !quoted) return null
    values[match[1]] = quoted ? quoted[2] : raw.replace(/\s+#.*$/, '').trim()
  }
  const url = values.VITE_SUPABASE_URL || ''
  const ref = url.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/)?.[1]
  const key = values.VITE_SUPABASE_ANON_KEY || ''
  const appUrl = (values.VITE_PUBLIC_APP_URL || '').replace(/\/$/, '')
  if (!ref || !/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(key) || (appUrl && !/^https:\/\/\S+$/.test(appUrl))) return null
  return { ref, url: `https://${ref}.supabase.co`, key, appUrl: appUrl || undefined }
}

function configDirectory(executable, platform, devRoot) {
  if (devRoot) return devRoot
  // A macOS executable lives inside the bundle; the folder beside the .app
  // is the location a teacher can actually carry and edit.
  if (platform === 'darwin') {
    const bundle = executable.match(/^(.*\.app)\/Contents\/MacOS\//)?.[1]
    if (bundle) return path.posix.dirname(bundle)
  }
  return path.dirname(executable)
}

function readPortableConfig(directory) {
  const filename = path.join(directory, '.env')
  try {
    if (!fs.existsSync(filename)) return { enabled: false, config: null }
    const config = parsePublicConfig(fs.readFileSync(filename, 'utf8'))
    return { enabled: true, config, path: filename, error: config ? undefined : '同資料夾的 .env 尚未填入有效的 Supabase 網址與公開金鑰。' }
  } catch {
    return { enabled: true, config: null, path: filename, error: '無法讀取同資料夾的 .env，請確認檔案權限。' }
  }
}

function savePortableConfig(directory, config) {
  const filename = path.join(directory, '.env')
  if (!fs.existsSync(filename)) return { ok: false, message: '隨身設定檔已被移除，請重新啟動程式。' }
  if (config && (typeof config !== 'object' || !/^[a-z0-9]{20}$/.test(config.ref || '')
    || !/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(config.key || '')
    || (config.appUrl && !/^https:\/\/\S+$/.test(config.appUrl)))) return { ok: false, message: '隨身設定內容無效。' }
  const text = config ? `VITE_SUPABASE_URL=https://${config.ref}.supabase.co\nVITE_SUPABASE_ANON_KEY=${config.key}\nVITE_PUBLIC_APP_URL=${config.appUrl || ''}\n` : keys.map((key) => `${key}=\n`).join('')
  if (config && !parsePublicConfig(text)) return { ok: false, message: '隨身設定內容無效。' }
  try {
    // Only these public values travel. Never serialize arbitrary renderer data
    // or copy private API keys into a file in a synced/removable folder.
    fs.writeFileSync(`${filename}.tmp`, text, { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(`${filename}.tmp`, filename)
    return { ok: true }
  } catch {
    return { ok: false, message: '無法寫入同資料夾的 .env，請確認資料夾可寫入。' }
  }
}

module.exports = { parsePublicConfig, configDirectory, readPortableConfig, savePortableConfig }
