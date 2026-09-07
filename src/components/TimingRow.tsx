import { formatSeconds } from '../lib/questionTiming'
import { usePresenterLocale } from '../lib/presenterI18n'

type Props = {
  label: string
  // What "no clock" is called here: a spoken answer has "不準備", a written one
  // has "不限時", and the difference matters to the teacher reading the row.
  offLabel: string
  presets: Array<number | null>
  value: number | null
  onChange: (seconds: number | null) => void
}

// Chips rather than a number field. The teacher sets this mid-class, and a row
// of taps beats typing into a spinner while thirty students wait.
export function TimingRow({ label, offLabel, presets, value, onChange }: Props) {
  const locale = usePresenterLocale()
  return (
    <div className="timing-row">
      <span className="timing-label">{label}</span>
      <div className="timing-presets">
        {presets.map((preset) => (
          <button
            aria-pressed={value === preset}
            className={value === preset ? 'timing-preset selected' : 'timing-preset'}
            key={preset ?? 'off'}
            type="button"
            onClick={() => onChange(preset)}
          >
            {preset === null ? offLabel : formatSeconds(preset, locale)}
          </button>
        ))}
      </div>
    </div>
  )
}
