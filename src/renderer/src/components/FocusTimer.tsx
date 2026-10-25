import { useEffect, useState, type ReactNode } from 'react'
import { Coffee, Pause, Play, Square, Timer } from 'lucide-react'
import { useStore, type FocusTimer } from '../store'
import { cx, formatClock } from '../lib/util'
import { ActionMenu, type MenuEntry } from './ui'

/** Sessões prontas. 25 minutos é o pomodoro clássico. */
export const FOCUS_PRESETS = [15, 25, 50, 90]
export const BREAK_PRESETS = [5, 15]

const remainingOf = (t: FocusTimer, now: number): number => (t.endsAt === null ? t.remaining : Math.max(0, t.endsAt - now))

/** Redesenha a cada segundo enquanto o temporizador corre. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

/** Botão da barra do documento: escolhe a duração e começa (entra no modo foco). */
export function FocusTimerButton(): ReactNode {
  const startTimer = useStore((s) => s.startTimer)
  const timer = useStore((s) => s.focusTimer)
  const sessions = useStore((s) => s.focusSessions)
  const items: MenuEntry[] = [
    ...FOCUS_PRESETS.map((m) => ({
      label: `Foco de ${m} min${m === 25 ? ' (pomodoro)' : ''}`,
      icon: <Timer size={14} />,
      onSelect: () => startTimer(m, 'focus')
    })),
    { type: 'separator' },
    ...BREAK_PRESETS.map((m) => ({ label: `Pausa de ${m} min`, icon: <Coffee size={14} />, onSelect: () => startTimer(m, 'break') }))
  ]
  const label = timer ? 'Trocar o temporizador' : `Temporizador de foco${sessions ? ` · ${sessions} hoje` : ''}`
  return <ActionMenu label={label} items={items} icon={<Timer size={15} />} className={cx(timer && 'timer-running')} />
}

/** Contador sempre visível (canto inferior direito) enquanto há uma sessão. */
export function FocusTimerPill(): ReactNode {
  const timer = useStore((s) => s.focusTimer)
  const sessions = useStore((s) => s.focusSessions)
  const pauseTimer = useStore((s) => s.pauseTimer)
  const resumeTimer = useStore((s) => s.resumeTimer)
  const stopTimer = useStore((s) => s.stopTimer)
  const now = useNow(!!timer && timer.endsAt !== null)
  if (!timer) return null

  const left = remainingOf(timer, now)
  const total = timer.minutes * 60_000
  const progress = total > 0 ? 1 - left / total : 1
  const paused = timer.endsAt === null
  const R = 15
  const C = 2 * Math.PI * R

  return (
    <div className={cx('focus-timer', timer.kind, paused && 'paused')} role="timer" aria-live="off" aria-label={`${timer.kind === 'focus' ? 'Foco' : 'Pausa'}: ${formatClock(left)} restantes`}>
      <svg className="focus-timer-ring" viewBox="0 0 36 36" aria-hidden>
        <circle cx="18" cy="18" r={R} className="track" />
        <circle cx="18" cy="18" r={R} className="bar" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
      </svg>
      <span className="focus-timer-text">
        <strong>{formatClock(left)}</strong>
        <small>
          {timer.kind === 'focus' ? 'Foco' : 'Pausa'}
          {paused ? ' · pausado' : ''}
          {sessions > 0 && timer.kind === 'focus' ? ` · ${sessions} hoje` : ''}
        </small>
      </span>
      <button
        type="button"
        className="icon-btn"
        title={paused ? 'Continuar' : 'Pausar'}
        aria-label={paused ? 'Continuar' : 'Pausar'}
        onClick={paused ? resumeTimer : pauseTimer}
      >
        {paused ? <Play size={14} /> : <Pause size={14} />}
      </button>
      <button type="button" className="icon-btn" title="Parar" aria-label="Parar o temporizador" onClick={stopTimer}>
        <Square size={13} />
      </button>
    </div>
  )
}

/** Dois toques curtos e baixos, para avisar sem assustar. */
function chime(): void {
  try {
    const ctx = new AudioContext()
    ;[0, 0.22].forEach((delay, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = i === 0 ? 660 : 880
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay)
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + delay + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.4)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + delay)
      osc.stop(ctx.currentTime + delay + 0.45)
    })
    setTimeout(() => void ctx.close(), 1200)
  } catch {
    // Sem áudio: o aviso na tela basta.
  }
}

/** Notificação do sistema, para quando o app está atrás de outra janela. */
function notify(body: string): void {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') new Notification('OpsiNote', { body, silent: true })
  } catch {
    // Sem notificações: o aviso na tela basta.
  }
}

/** Vigia o fim da sessão (mesmo fora da tela do documento) e avisa. Use uma vez, no App. */
export function useFocusTimerWatcher(): void {
  const running = useStore((s) => s.focusTimer?.endsAt ?? null)
  useEffect(() => {
    if (running === null) return
    const check = (): void => {
      const s = useStore.getState()
      const t = s.focusTimer
      if (!t || t.endsAt === null || t.endsAt > Date.now()) return
      const done = s.finishTimer()
      if (!done) return
      chime()
      if (done.kind === 'focus') {
        const message = `Sessão de ${done.minutes} min concluída. Hora de uma pausa?`
        notify(message)
        s.showToast(message, { label: 'Pausa de 5 min', run: () => useStore.getState().startTimer(5, 'break') })
      } else {
        const message = 'Pausa terminada.'
        notify(message)
        s.showToast(message, { label: 'Foco de 25 min', run: () => useStore.getState().startTimer(25, 'focus') })
      }
    }
    check()
    const id = setInterval(check, 500)
    return () => clearInterval(id)
  }, [running])
}
