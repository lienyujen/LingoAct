// Rasterises public/favicon.svg into the Windows icons electron-builder ships.
//
//   node scripts/build-app-icons.mjs
//
// Run it after editing the SVG; the outputs are committed, so a normal build
// does not need Electron on the path.
//
// Electron does the rasterising because it is already a dependency and it is
// the very engine that will display the result — no image library is added to
// the tree for a task that runs a handful of times in the project's life.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'build')
// 256 has to be present: electron-builder rejects an .ico without it. The rest
// are the sizes Windows actually picks from — title bar, taskbar, Alt-Tab,
// and the large tiles in Start.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const PNG_SIZE = 512

const electronMain = path.join(root, 'scripts', '.icon-renderer.cjs')
fs.writeFileSync(electronMain, `
const { app, BrowserWindow, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')

const svg = fs.readFileSync(process.argv[2], 'utf8')
const outDir = process.argv[3]
const sizes = JSON.parse(process.argv[4])

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  // One window, resized between captures. A second BrowserWindow created with
  // offscreen rendering fails every load in this Electron build, which showed up
  // as only the first size ever being written.
  const win = new BrowserWindow({
    width: 512, height: 512, show: false, frame: false, transparent: true, useContentSize: true,
  })
  const pagePath = path.join(outDir, '.icon-page.html')

  for (const size of sizes) {
    // Drawn at its own size rather than downsampled from one big render, so the
    // shapes are hinted for the size Windows will actually show.
    const page = '<!doctype html><meta charset="utf-8">'
      + '<style>html,body{margin:0;padding:0;background:transparent;width:' + size + 'px;height:' + size + 'px;overflow:hidden}'
      + 'svg{display:block;width:' + size + 'px;height:' + size + 'px}</style>'
      + svg
    fs.writeFileSync(pagePath, page)
    win.setContentSize(size, size)
    await win.loadFile(pagePath)
    await new Promise((resolve) => setTimeout(resolve, 200))
    const image = await win.webContents.capturePage()
    const resized = image.getSize().width === size ? image : image.resize({ width: size, height: size })
    fs.writeFileSync(path.join(outDir, size + '.png'), resized.toPNG())
  }

  fs.unlinkSync(pagePath)
  win.destroy()
  app.quit()
}).catch((error) => { console.error(error); process.exit(1) })
`)

const electronBinary = fs.readFileSync(path.join(root, 'node_modules/electron/path.txt'), 'utf8').trim()
const electronPath = path.join(root, 'node_modules/electron/dist', electronBinary)

const sizes = [...new Set([...ICO_SIZES, PNG_SIZE])].sort((a, b) => a - b)
await new Promise((resolve, reject) => {
  const child = spawn(
    electronPath,
    [electronMain, path.join(root, 'public/favicon.svg'), outDir, JSON.stringify(sizes)],
    { stdio: 'inherit', env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' } },
  )
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`electron exited ${code}`))))
  child.on('error', reject)
})
fs.unlinkSync(electronMain)

// An .ico is a six-byte header, a sixteen-byte directory entry per image, then
// the images themselves. Windows has accepted PNG-compressed entries since
// Vista, which is what lets this be a packer rather than a BMP encoder.
function buildIco(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)          // reserved
  header.writeUInt16LE(1, 2)          // 1 = icon
  header.writeUInt16LE(pngs.length, 4)

  const directory = Buffer.alloc(16 * pngs.length)
  let offset = header.length + directory.length
  pngs.forEach(({ size, data }, index) => {
    const at = index * 16
    // 256 is stored as 0: the field is one byte, so 256 does not fit.
    directory.writeUInt8(size >= 256 ? 0 : size, at)
    directory.writeUInt8(size >= 256 ? 0 : size, at + 1)
    directory.writeUInt8(0, at + 2)   // palette size, 0 for truecolour
    directory.writeUInt8(0, at + 3)   // reserved
    directory.writeUInt16LE(1, at + 4)   // colour planes
    directory.writeUInt16LE(32, at + 6)  // bits per pixel
    directory.writeUInt32LE(data.length, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += data.length
  })
  return Buffer.concat([header, directory, ...pngs.map((png) => png.data)])
}

const icoEntries = ICO_SIZES.map((size) => ({
  size,
  data: fs.readFileSync(path.join(outDir, `${size}.png`)),
}))
const ico = buildIco(icoEntries)

// electron-builder.cjs points installerIcon, uninstallerIcon and
// installerHeaderIcon at this same file, so there is only one to write.
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico)
fs.copyFileSync(path.join(outDir, `${PNG_SIZE}.png`), path.join(outDir, 'icon.png'))

for (const size of sizes) fs.unlinkSync(path.join(outDir, `${size}.png`))

console.log(`icon.ico: ${ICO_SIZES.join(', ')}px  (${(ico.length / 1024).toFixed(1)} KB)`)
console.log(`icon.png: ${PNG_SIZE}x${PNG_SIZE}`)
