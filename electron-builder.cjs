// APP_EDITION picks the Windows app to build. It only renames the artifact and
// its product name; both editions ship the same code, and the caption controls
// are gated at runtime by VITE_APP_EDITION (see src/lib/edition.ts).
//   unset / standard -> LingoAct.exe
//   plus             -> LingoActPlus.exe
const productName = process.env.APP_EDITION === 'plus' ? 'LingoActPlus' : 'LingoAct'

module.exports = {
  appId: 'tw.lingoact.presenter.desktop',
  productName,
  artifactName: `${productName}.\${ext}`,
  directories: {
    output: 'release',
  },
  files: [
    'dist/**/*',
    'electron/**/*',
    'package.json',
    // package.json's dependencies are renderer-only libraries already
    // bundled into dist/**/*.js by Vite, so none of them needs shipping.
    '!node_modules/**/*',
    // The one exception: the main process requires subset-font to cut a
    // per-clip Bopomofo font, so its tree has to travel. pnpm links packages
    // through .pnpm, which these patterns follow.
    'node_modules/subset-font/**/*',
    'node_modules/fontverter/**/*',
    'node_modules/harfbuzzjs/**/*',
    'node_modules/wawoff2/**/*',
    'node_modules/woff2sfnt-sfnt2woff/**/*',
    'node_modules/pako/**/*',
    'node_modules/p-limit/**/*',
    'node_modules/yocto-queue/**/*',
    'node_modules/.pnpm/**/*',
  ],
  // The UI only ships zh-TW and en-US strings; without this, electron-builder
  // bundles all ~55 Chromium locale .pak files (~49MB of unused languages).
  electronLanguages: ['en-US', 'zh-TW'],
  extraResources: [
    {
      from: 'build/icon.ico',
      to: 'icon.ico',
    },
    // Fetched by scripts/fetch-bopomofo-font.mjs, not carried in git. Apache
    // 2.0 requires the licence and NOTICE to ship with the binary, so the whole
    // folder goes.
    {
      from: 'resources/fonts',
      to: 'fonts',
    },
  ],
  win: {
    icon: 'build/icon.ico',
    executableName: productName,
    requestedExecutionLevel: 'asInvoker',
    target: [
      {
        target: 'portable',
        arch: ['x64'],
      },
      // Unlike portable, which re-extracts its full payload to a temp folder
      // on every launch (~10s), this zip is unpacked once and the exe inside
      // then starts directly (~2s) on every subsequent run.
      {
        target: 'zip',
        arch: ['x64'],
      },
    ],
  },
  nsis: {
    allowElevation: false,
    installerIcon: 'build/icon.ico',
    installerHeaderIcon: 'build/icon.ico',
    packElevateHelper: false,
    perMachine: false,
    uninstallerIcon: 'build/icon.ico',
  },
  portable: {
    requestExecutionLevel: 'user',
  },
}
