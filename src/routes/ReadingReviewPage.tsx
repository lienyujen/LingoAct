import { useEffect, useState } from 'react'
import { X } from '@phosphor-icons/react'
import { useParams } from 'react-router-dom'
import { ListeningPlayer } from '../components/ListeningPlayer'
import { ReadingPassageView } from '../components/ReadingPassageView'
import { fetchListeningClip } from '../lib/listening'
import { PresenterLanguageScope, presenterLookup, storedPresenterLocale } from '../lib/presenterI18n'
import { requireSupabase } from '../lib/supabase'
import type { ListeningClip, Question, ReadingPassage } from '../types'

type ReadingMaterial = {
  question: Question
  passage: ReadingPassage
  imageUrl: string | null
  clip: ListeningClip | null
}

async function loadReading(sessionId: string, questionId: string): Promise<ReadingMaterial> {
  const supabase = requireSupabase()
  const [{ data: question, error: questionError }, { data: passage, error: passageError }] = await Promise.all([
    supabase.from('questions').select('*').eq('session_id', sessionId).eq('id', questionId).eq('type', 'reading').maybeSingle<Question>(),
    supabase.from('reading_passages').select('*').eq('session_id', sessionId).eq('question_id', questionId).maybeSingle<ReadingPassage>(),
  ])
  if (questionError || passageError || !question || !passage) throw new Error('Reading material unavailable')

  const [image, clip] = await Promise.all([
    question.share_screenshot && question.screenshot_id
      ? supabase.from('screenshots').select('public_url').eq('id', question.screenshot_id).eq('session_id', sessionId).maybeSingle()
      : null,
    question.listening_clip_id ? fetchListeningClip(question.listening_clip_id).catch(() => null) : null,
  ])
  return { question, passage, imageUrl: image?.data?.public_url ?? null, clip }
}

export function ReadingReviewPage() {
  const { sessionId = '', questionId = '' } = useParams()
  const [locale] = useState(() => storedPresenterLocale(sessionId))
  const [material, setMaterial] = useState<ReadingMaterial | null>(null)
  const [failed, setFailed] = useState(false)
  const [readingCue, setReadingCue] = useState(-1)
  const t = presenterLookup(locale)

  useEffect(() => {
    let open = true
    void loadReading(sessionId, questionId).then((reading) => {
      if (open) setMaterial(reading)
    }).catch(() => {
      if (open) setFailed(true)
    })
    return () => { open = false }
  }, [sessionId, questionId])

  const question = material?.question
  return (
    <PresenterLanguageScope value={locale}>
      <main className="custom-quiz-native-page">
        <header>
          <h1>{t('typeReading')}</h1>
          <button aria-label={t('close')} className="icon-button" title={t('close')} type="button"
            onClick={() => void window.lingoActDesktop?.close()}><X size={24} /></button>
        </header>
        {material && question ? (
          <div className="custom-quiz-native-content is-single">
            <section className="custom-quiz-reading-panel">
              <ReadingPassageView
                activeCue={readingCue}
                cues={question.karaoke_cues}
                englishGlossOption={material.passage.level_framework === 'guoyu108'}
                fontControls
                imageUrl={material.imageUrl}
                locale={locale}
                passage={material.passage}
                strokePractice={material.passage.level_framework === 'guoyu108' && /^g[1-6]$/.test(material.passage.level_code || '')}
                player={material.clip ? (
                  <ListeningPlayer
                    clip={material.clip}
                    karaokeCues={question.karaoke_cues}
                    locale={locale}
                    questionId={question.id}
                    readingFontUrl={question.reading_font_url}
                    readingRuby={question.reading_ruby}
                    readingWords={question.reading_words}
                    replayLimit={null}
                    variant="inline"
                    onActiveCue={setReadingCue}
                  />
                ) : null}
              />
            </section>
          </div>
        ) : failed ? <p className="error custom-quiz-native-error" role="alert">{t('readingLoadFailed')}</p>
          : <p className="muted custom-quiz-native-loading" role="status">{t('loadingReading')}</p>}
      </main>
    </PresenterLanguageScope>
  )
}
