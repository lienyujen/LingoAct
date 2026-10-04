const fs = require('node:fs')
const path = require('node:path')

// Profile says which teaching room the build opens into; edition says which
// paid feature set it carries. They are independent axes, not forks.
const profiles = {
  full: { executable: 'LingoAct', appId: 'tw.lingoact.presenter.desktop' },
  huayu: { executable: 'LingoAct-Huayu', appId: 'tw.lingoact.huayu.desktop' },
  english: { executable: 'LingoAct-English', appId: 'tw.lingoact.english.desktop' },
  guoyu: { executable: 'LingoAct-Guoyu', appId: 'tw.lingoact.guoyu.desktop' },
  ncacls: { executable: 'LingoAct-NCACLS', appId: 'org.ncacls.lingoact.desktop', icon: 'build/icon-ncacls.ico', macIcon: 'build/ncacls-source.png' },
}
const profileId = Object.hasOwn(profiles, process.env.APP_PROFILE) ? process.env.APP_PROFILE : 'full'
const profile = profiles[profileId]
// An edition may ship its own icon. Until that file exists the build falls
// back to LingoAct's rather than failing, so a missing piece of artwork never
// blocks a build — but the fallback is visible here rather than silent.
const iconPath = profile.icon && fs.existsSync(path.join(__dirname, profile.icon))
  ? profile.icon
  : 'build/icon.ico'
// The same fallback on the other side. electron-builder renders the .icns from
// a png; build/icon.png is 512px square and the NCACLS source is 1254px, both
// comfortably past the minimum.
const macIconPath = profile.macIcon && fs.existsSync(path.join(__dirname, profile.macIcon))
  ? profile.macIcon
  : 'build/icon.png'
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
    'supabase/licenses/**/*',
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
      from: iconPath,
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
    icon: iconPath,
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
  mac: {
    icon: macIconPath,
    category: 'public.app-category.education',
    target: [
      {
        // One download for both Apple Silicon and Intel. Two architecture
        // specific files would be smaller, but the audience is teachers, and
        // "which one is my Mac?" is a question a download page should not have
        // to answer.
        target: 'dmg',
        arch: ['universal'],
      },
    ],
    // There is no Apple Developer ID to sign with, but "no signature at all"
    // is not an option on Apple Silicon: the kernel refuses to run an arm64
    // binary that carries none, and no amount of clearing quarantine helps.
    // '-' is the ad-hoc identity — worth nothing as an assurance of who built
    // this, but it is what makes the app launchable once Gatekeeper has been
    // cleared once. identity: null means something else entirely: skip signing.
    identity: '-',
    // Hardened runtime only means anything alongside notarization, and enabling
    // it unsigned costs the entitlements without buying the trust.
    hardenedRuntime: false,
    extendInfo: {
      // macOS denies these outright when the usage string is absent, and the
      // refusal reaches the renderer as an ordinary permission error — so the
      // feature looks broken rather than unapproved.
      NSMicrophoneUsageDescription: 'LingoAct 使用麥克風提供錄音評測、即時字幕與口譯。',
      NSScreenCaptureUsageDescription: 'LingoAct 需要錄製螢幕，才能把畫面上的教材擷取成題目派送給學生。',
    },
  },
  dmg: {
    title: productName,
  },
  nsis: {
    allowElevation: false,
    installerIcon: iconPath,
    installerHeaderIcon: iconPath,
    packElevateHelper: false,
    perMachine: false,
    uninstallerIcon: iconPath,
  },
  portable: {
    requestExecutionLevel: 'user',
  },
}
