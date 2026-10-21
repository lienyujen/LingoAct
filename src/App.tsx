import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { DesktopWindowChrome } from './components/DesktopWindowChrome'
import { ErrorBoundary } from './ErrorBoundary'
import { DesktopOverlayPage } from './routes/DesktopOverlayPage'
import { CustomQuizReviewPage } from './routes/CustomQuizReviewPage'
import { BoardReviewPage } from './routes/BoardReviewPage'
import { HotspotReviewPage } from './routes/HotspotReviewPage'
import { SubmissionReviewPage } from './routes/SubmissionReviewPage'
import { HomePage } from './routes/HomePage'
import { JoinPage } from './routes/JoinPage'
import { ParticipantPage } from './routes/ParticipantPage'
import { RosterPage } from './routes/RosterPage'
import { PresenterNewPage } from './routes/PresenterNewPage'
import { PresenterPage } from './routes/PresenterPage'
import { SessionReportPage } from './routes/SessionReportPage'
import { WordCloudPage } from './routes/WordCloudPage'
import { BackendSetup } from './components/BackendSetup'
import { isSupabaseConfigured } from './lib/supabase'
import { useSessionReportBack } from './lib/sessionReportNavigation'
import { PresenterLocaleContext, presenterLocaleFor } from './lib/presenterI18n'
import { supportsChineseSystemLanguage, useScSystemLanguage } from './lib/scSystemLanguage'
import { setUiLanguage, useUiLanguage } from './lib/uiText'
import { useEffect } from 'react'
import { APP_PROFILE } from './lib/appProfiles'
import { useJapaneseInterfaceLanguage } from './lib/japaneseInterface'
import { brandFromSearch } from './lib/brand'
import japaneseLogo from './assets/jp-logo.png'

function AppRoutes() {
  const japaneseLanguage = useJapaneseInterfaceLanguage()
  const systemLanguage = useScSystemLanguage()
  const location = useLocation()
  useEffect(() => {
    if (brandFromSearch(new URLSearchParams(location.search)) !== 'japanese') return
    document.title = 'LingoAct-JP'
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!icon) return
    const previous = { href: icon.href, type: icon.type }
    icon.href = japaneseLogo
    icon.type = 'image/png'
    return () => { icon.href = previous.href; icon.type = previous.type }
  }, [location.search])
  useEffect(() => {
    if (APP_PROFILE.id === 'japanese' && !location.pathname.startsWith('/participant/') && !location.pathname.startsWith('/join/')) setUiLanguage(japaneseLanguage)
    if (APP_PROFILE.id === 'ncacls' && !location.pathname.startsWith('/participant/')) setUiLanguage('zh-TW')
    if (supportsChineseSystemLanguage && (location.pathname === '/' || location.pathname === '/presenter/new' || !isSupabaseConfigured)) setUiLanguage(systemLanguage)
  }, [systemLanguage, japaneseLanguage, location.pathname])
  const returnFromSessionReport = useSessionReportBack()
  const isDesktop = Boolean(window.lingoActDesktop)
  const isDesktopOverlay = location.pathname.startsWith('/desktop-overlay/')
  const isCustomQuizReview = location.pathname.startsWith('/custom-quiz-review/')
  const isHotspotReview = location.pathname.startsWith('/hotspot-review/')
  const isSubmissionReview = location.pathname.startsWith('/submission-review/')
  const isBoardReview = location.pathname.startsWith('/board-review/')
  const isDesktopPresenter = isDesktop && location.pathname.startsWith('/presenter/') && location.pathname !== '/presenter/new'
  const isSessionReport = location.pathname.startsWith('/session-report/')
  const isWordCloud = location.pathname.startsWith('/word-cloud/')
  const isRoster = location.pathname.startsWith('/roster/')

  // A downloaded build has no project baked in, so ask the presenter for theirs
  // before anything else. Students arrive through a link that already carries one.
  if (isDesktop && !isSupabaseConfigured) {
    return (
      <div className="desktop-shell">
        <DesktopWindowChrome confirmClose={false} />
        <BackendSetup />
      </div>
    )
  }

  return (
    <div className={isDesktop ? 'desktop-shell' : undefined}>
      {!isDesktopOverlay && !isDesktopPresenter && !isCustomQuizReview && !isHotspotReview && !isSubmissionReview && !isBoardReview && !isRoster && (
        <DesktopWindowChrome
          confirmClose={!isWordCloud}
          onBack={isSessionReport ? returnFromSessionReport : undefined}
        />
      )}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/presenter/new" element={isDesktop ? <PresenterNewPage /> : <Navigate to="/" replace />} />
        <Route path="/presenter/:sessionId" element={isDesktop ? <PresenterPage /> : <Navigate to="/" replace />} />
        <Route path="/desktop-overlay/:sessionId" element={isDesktop ? <DesktopOverlayPage /> : <Navigate to="/" replace />} />
        <Route path="/custom-quiz-review/:sessionId/:questionId" element={isDesktop ? <CustomQuizReviewPage /> : <Navigate to="/" replace />} />
        <Route path="/hotspot-review/:sessionId/:questionId" element={isDesktop ? <HotspotReviewPage /> : <Navigate to="/" replace />} />
        <Route path="/submission-review/:sessionId/:questionId" element={isDesktop ? <SubmissionReviewPage /> : <Navigate to="/" replace />} />
        <Route path="/board-review/:sessionId/:questionId" element={isDesktop ? <BoardReviewPage /> : <Navigate to="/" replace />} />
        <Route path="/session-report/:sessionId" element={isDesktop ? <SessionReportPage /> : <Navigate to="/" replace />} />
        <Route path="/roster/:sessionId" element={isDesktop ? <RosterPage /> : <Navigate to="/" replace />} />
        <Route path="/word-cloud/:sessionId" element={isDesktop ? <WordCloudPage /> : <Navigate to="/" replace />} />
        <Route path="/join/:sessionId" element={<JoinPage />} />
        <Route path="/participant/:sessionId" element={<ParticipantPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export function App() {
  const japaneseLanguage = useJapaneseInterfaceLanguage()
  const uiLanguage = useUiLanguage()
  const systemLanguage = useScSystemLanguage()
  useEffect(() => {
    document.documentElement.lang = uiLanguage
    if (supportsChineseSystemLanguage || APP_PROFILE.id === 'japanese') document.title = APP_PROFILE.productName
  }, [uiLanguage])
  return (
    <HashRouter>
      <PresenterLocaleContext.Provider value={APP_PROFILE.id === 'japanese' ? japaneseLanguage : supportsChineseSystemLanguage ? systemLanguage : APP_PROFILE.defaultTrack === 'en' ? (uiLanguage === 'zh-TW' ? 'zh-TW' : 'en') : presenterLocaleFor(APP_PROFILE.defaultTrack)}>
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
      </PresenterLocaleContext.Provider>
    </HashRouter>
  )
}

export default App
