import { useCallback, useEffect, useState } from 'react'
import { Cursor, X } from '@phosphor-icons/react'
import { useParams } from 'react-router-dom'
import { HotspotImage } from '../components/HotspotImage'
import { getPresenterToken } from '../lib/presenterAuth'
import { parsePins, pinColor, pinLabel } from '../lib/hotspot'
import { requireSupabase } from '../lib/supabase'
import { PresenterLocaleContext, presenterLocaleFor, presenterLookup } from '../lib/presenterI18n'

type HotspotResult = {
  question: { id: string; title: string; prompt_text: string | null; max_pins: number | null }
  answers: Array<{ participant_id: string; participant_name: string; answer_values: string[] | null }>
  imageUrl: string | null
}

// The panel on the presenter page is a column beside the class list, and a
// classroom photo in it is thumbnail-sized. This is the same picture at the
// size the taps were actually made on.
export function HotspotReviewPage() {
  const { sessionId = '', questionId = '' } = useParams()
  const [result, setResult] = useState<HotspotResult | null>(null)
  const [anonymous, setAnonymous] = useState(false)
  const [error, setError] = useState('')
  // Its own window, so it reads the class's teaching language itself rather
  // than inheriting a context that stops at the presenter page.
  const [locale, setLocale] = useState(() => presenterLocaleFor(null))
  const t = presenterLookup(locale)

  const load = useCallback(async () => {
    const presenterToken = getPresenterToken(sessionId)
    if (!presenterToken) {
      setError(t('noRightsRejoin'))
      return
    }
    const supabase = requireSupabase()
    const [{ data, error: loadError }, { data: sessionRow }] = await Promise.all([
      supabase.functions.invoke('presenter-action', {
        body: { action: 'get_hotspot_result', sessionId, presenterToken, questionId },
      }),
      supabase.from('sessions').select('teaching_language, anonymous_enabled').eq('id', sessionId).maybeSingle(),
    ])
    if (loadError || !data?.question) {
      setError(data?.message || t('cloudUpdateFailed', { message: '' }))
      return
    }
    setLocale(presenterLocaleFor((sessionRow as { teaching_language?: string } | null)?.teaching_language || null))
    setResult(data as HotspotResult)
    setError('')
  }, [questionId, sessionId, t])

  useEffect(() => {
    void load()
    // Students keep tapping while the window is open; the picture should keep up.
    const timer = window.setInterval(() => void load(), 2500)
    return () => window.clearInterval(timer)
  }, [load])

  const answers = result?.answers || []
  const pins = answers.flatMap((entry, index) => parsePins(entry.answer_values).map((point) => ({
    ...point,
    label: pinLabel(entry.participant_name, anonymous, index),
    color: pinColor(entry.participant_id),
  })))

  return (
    <PresenterLocaleContext.Provider value={locale}>
    <main className="hotspot-review-window">
      <header>
        <div>
          <p className="eyebrow"><Cursor size={17} />{t('typeHotspot')}</p>
          <h1>{result?.question.prompt_text || result?.question.title || t('typeHotspot')}</h1>
        </div>
        <label className="show-answers-toggle">
          <input checked={anonymous} type="checkbox" onChange={(event) => setAnonymous(event.target.checked)} />
          {t('anonymous')}
        </label>
        <button aria-label={t('close')} className="icon-button" title={t('close')} type="button" onClick={() => window.lingoActDesktop?.close()}>
          <X size={24} />
        </button>
      </header>
      {error && <p className="error">{error}</p>}
      {result && (
        <>
          <p className="muted">{t('hotspotTally', { people: answers.length, pins: pins.length })}</p>
          {result.imageUrl
            ? <div className="hotspot-review-stage"><HotspotImage alt={t('typeHotspot')} imageUrl={result.imageUrl} pins={pins} /></div>
            : <p className="muted">{t('hotspotNobody')}</p>}
        </>
      )}
      {!result && !error && <p className="muted">{t('loadingSession')}</p>}
    </main>
    </PresenterLocaleContext.Provider>
  )
}
