// Cuts an edition's Windows icon out of a supplied logo.
//
//   node scripts/build-profile-icon.mjs --source build/ncacls-source.png --profile ncacls
//   node scripts/build-profile-icon.mjs --source ... --profile ncacls --crop 64
//
// Writes build/icon-<profile>.ico, which electron-builder.cjs picks up for
// that profile, plus build/icon-<profile>-preview.png to look at first.
//
// A crest with a ring of text around it has to be cropped, not merely scaled:
// at 32px the ring is an illegible grey fringe that eats the half of the
// canvas the actual mark needs. --crop is the percentage of the source kept,
// centred; the default keeps the middle 72%.
//
// Electron does the rasterising for the same reason build-app-icons.mjs does:
// it is already a dependency, and it is the engine that will show the result.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'build')
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

function arg(name, fallback = null) {
  const at = process.argv.indexOf(`--${name}`)
  return at > -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback
}

const source = arg('source')
const profile = arg('profile')
const crop = Number(arg('crop', '72'))
// A logo saved as a rounded tile without an alpha channel has black corners,
// not transparent ones, and Windows draws them: a black square around the
// mark on every surface that is not itself black. Clipping to the same radius
// throws them away. Percent of the side; 0 leaves the image square.
const radius = Number(arg('radius', '0'))
if (!source || !profile) {
  console.error('usage: --source <image> --profile <id> [--crop 72]')
  process.exit(1)
}
if (!Number.isFinite(crop) || crop <= 0 || crop > 100) {
  console.error('--crop must be a percentage between 1 and 100')
  process.exit(1)
}
if (!Number.isFinite(radius) || radius < 0 || radius > 50) {
  console.error('--radius must be a percentage between 0 and 50')
  process.exit(1)
}
const sourcePath = path.isAbsolute(source) ? source : path.join(root, source)
if (!fs.existsSync(sourcePath)) {
  console.error(`no such file: ${sourcePath}`)
  process.exit(1)
}

// background-size scales the source so the kept fraction fills the square, and
// centring it drops an equal margin on every side.
const scale = (100 / crop) * 100
const dataUrl = `data:${{
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
}[path.extname(sourcePath).toLowerCase()] || 'image/png'};base64,${fs.readFileSync(sourcePath).toString('base64')}`

const dataUrlPath = path.join(outDir, '.profile-icon-source.txt')
fs.writeFileSync(dataUrlPath, dataUrl)

const electronMain = path.join(root, 'scripts', '.profile-icon-renderer.cjs')
fs.writeFileSync(electronMain, `
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const [, , outDir, sizesJson, scale, dataUrlPath, radius] = process.argv
// Read from a file rather than argv: a base64 logo is hundreds of kilobytes
// and Windows refuses a command line that long (ENAMETOOLONG).
const dataUrl = fs.readFileSync(dataUrlPath, 'utf8')
const sizes = JSON.parse(sizesJson)

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512, height: 512, show: false, frame: false, transparent: true, useContentSize: true,
  })
  const pagePath = path.join(outDir, '.profile-icon-page.html')
  for (const size of sizes) {
    const page = '<!doctype html><meta charset="utf-8">'
      + '<style>html,body{margin:0;padding:0;width:' + size + 'px;height:' + size + 'px;overflow:hidden}'
      + '.mark{width:' + size + 'px;height:' + size + 'px;'
      + 'background-image:url("' + dataUrl + '");'
      + 'background-repeat:no-repeat;background-position:center center;'
      + 'background-size:' + scale + '% auto;image-rendering:auto;'
      + 'border-radius:' + radius + '%}</style>'
      + '<div class="mark"></div>'
    fs.writeFileSync(pagePath, page)
    win.setContentSize(size, size)
    await win.loadFile(pagePath)
    await new Promise((resolve) => setTimeout(resolve, 220))
    const image = await win.webContents.capturePage()
    const resized = image.getSize().width === size ? image : image.resize({ width: size, height: size })
    fs.writeFileSync(path.join(outDir, '.profile-' + size + '.png'), resized.toPNG())
  }
  fs.unlinkSync(pagePath)
  win.destroy()
  app.quit()
}).catch((error) => { console.error(error); process.exit(1) })
`)

const electronBinary = fs.readFileSync(path.join(root, 'node_modules/electron/path.txt'), 'utf8').trim()
const electronPath = path.join(root, 'node_modules/electron/dist', electronBinary)

await new Promise((resolve, reject) => {
  const child = spawn(
    electronPath,
    [electronMain, outDir, JSON.stringify(ICO_SIZES), String(scale), dataUrlPath, String(radius)],
    { stdio: 'inherit', env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' } },
  )
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`electron exited ${code}`))))
  child.on('error', reject)
})
fs.unlinkSync(electronMain)
fs.unlinkSync(dataUrlPath)

// Same packer as build-app-icons.mjs: header, one directory entry per image,
// then PNG-compressed images, which Windows has accepted since Vista.
function buildIco(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  const directory = Buffer.alloc(16 * pngs.length)
  let offset = header.length + directory.length
  pngs.forEach(({ size, data }, index) => {
    const at = index * 16
    directory.writeUInt8(size >= 256 ? 0 : size, at)
    directory.writeUInt8(size >= 256 ? 0 : size, at + 1)
    directory.writeUInt8(0, at + 2)
    directory.writeUInt8(0, at + 3)
    directory.writeUInt16LE(1, at + 4)
    directory.writeUInt16LE(32, at + 6)
    directory.writeUInt32LE(data.length, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += data.length
  })
  return Buffer.concat([header, directory, ...pngs.map((png) => png.data)])
}

const entries = ICO_SIZES.map((size) => ({ size, data: fs.readFileSync(path.join(outDir, `.profile-${size}.png`)) }))
fs.writeFileSync(path.join(outDir, `icon-${profile}.ico`), buildIco(entries))
fs.copyFileSync(path.join(outDir, '.profile-256.png'), path.join(outDir, `icon-${profile}-preview.png`))
for (const { size } of entries) fs.unlinkSync(path.join(outDir, `.profile-${size}.png`))

console.log(`build/icon-${profile}.ico written — ${ICO_SIZES.join(', ')} px, keeping the middle ${crop}%${radius ? `, corners clipped at ${radius}%` : ''}`)
console.log(`build/icon-${profile}-preview.png written — look at this before shipping it`)
