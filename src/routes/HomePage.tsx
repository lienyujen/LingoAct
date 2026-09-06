import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, SignIn } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { SetupNotice } from '../components/SetupNotice'

export function HomePage() {
  const [sessionId, setSessionId] = useState('')
  const navigate = useNavigate()

  function join(event: FormEvent) {
    event.preventDefault()
    const value = sessionId.trim()
    if (value) navigate(`/join/${value}`)
  }

  return (
    <main className="home-page">
      <SetupNotice />
      <section className="home-content">
        {/* The old line spelled out InterAct — I-T-E-R-A-C-T — which is a
            different product and says nothing about a language class. The four
            skills are the frame a language teacher actually plans in, and this
            app now covers all four. */}
        <p className="eyebrow">Listening, Speaking, Reading and Writing, live in the classroom</p>
        <h1>LingoAct 語言教學互動系統</h1>
        <p className="lede">請掃描老師提供的 QR Code，或輸入場次代碼加入課堂。</p>
        <div className="home-actions">
          <form className="join-form" onSubmit={join}>
            <input value={sessionId} onChange={(event) => setSessionId(event.target.value)} placeholder="輸入場次代碼" />
            <button type="submit"><SignIn size={18} />加入場次<ArrowRight size={17} /></button>
          </form>
        </div>
      </section>
    </main>
  )
}
