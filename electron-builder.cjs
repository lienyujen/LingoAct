// Profile says which teaching room the build opens into; edition says which
// paid feature set it carries. They are independent axes, not forks.
const profiles = {
  full: { executable: 'LingoAct', appId: 'tw.lingoact.presenter.desktop' },
  huayu: { executable: 'LingoAct-Huayu', appId: 'tw.lingoact.huayu.desktop' },
  english: { executable: 'LingoAct-English', appId: 'tw.lingoact.english.desktop' },
  guoyu: { executable: 'LingoAct-Guoyu', appId: 'tw.lingoact.guoyu.desktop' },
}
const profileId = Object.hasOwn(profiles, process.env.APP_PROFILE) ? process.env.APP_PROFILE : 'full'
const profile = profiles[profileId]
const productName = process.env.APP_EDITION === 'plus'
  ? `${profile.executable}${profileId === 'full' ? 'Plus' : '-Plus'}`
  : profile.executable

module.exports = {
  appId: profile.appId,
  productName,
  artifactName: `${productName}.\${ext}`,
  extraMetadata: {
    lingoactProfile: profileId,
    productName,
  },
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
