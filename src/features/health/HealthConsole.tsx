import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  loadLatestEncryptedBackup,
  saveEncryptedBackup,
} from '../identity/client'
import { loadHealth, saveHealth } from './store'
import { HrtDoseForm } from './HrtDoseForm'
import { ConcentrationGraph } from './ConcentrationGraph'
import {
  medicationLabels,
  routeLabels,
  type DoseEvent,
  type HealthSnapshot,
  type MoodEntry,
} from './types'

interface HealthConsoleProps {
  userId: string
  token?: string
  guest?: boolean
}

type Page = 'overview' | 'history' | 'calibration' | 'mood'

const nowInput = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)

function id(): string {
  return crypto.randomUUID()
}

function toIso(localValue: string): string {
  return new Date(localValue).toISOString()
}

function dayKey(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function entryTime(value: string): string {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function parseHashtags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\s,]+/)
        .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
        .map((tag) => tag.replace(/[^#\p{L}\p{N}_-]/gu, ''))
        .filter((tag) => tag.length > 1),
    ),
  ]
}

function hashtagCloud(
  moods: MoodEntry[],
): Array<{ name: string; count: number; max: number }> {
  const counts = new Map<string, number>()
  for (const mood of moods) {
    for (const tag of mood.hashtags ?? [])
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  const max = Math.max(...counts.values(), 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count, max }))
}

export function HealthConsole({
  userId,
  token,
  guest = false,
}: HealthConsoleProps) {
  const [snapshot, setSnapshot] = useState<HealthSnapshot>(() =>
    loadHealth(userId),
  )
  const [page, setPage] = useState<Page>('overview')
  const [moodScore, setMoodScore] = useState<MoodEntry['score']>(3)
  const [moodNote, setMoodNote] = useState('')
  const [moodHashtags, setMoodHashtags] = useState('')
  const [moodAt, setMoodAt] = useState(nowInput)
  const [syncState, setSyncState] = useState('local')
  const [message, setMessage] = useState('')

  useEffect(() => {
    saveHealth(userId, snapshot)
  }, [snapshot, userId])

  const timeline = useMemo(
    () =>
      [...snapshot.doses, ...snapshot.moods].sort(
        (a, b) => Date.parse(b.at) - Date.parse(a.at),
      ),
    [snapshot],
  )

  const moodDays = useMemo(() => {
    const grouped = new Map<string, MoodEntry[]>()
    for (const entry of snapshot.moods) {
      const key = dayKey(entry.at)
      const entries = grouped.get(key) ?? []
      entries.push(entry)
      grouped.set(key, entries)
    }
    return Array.from({ length: 30 }, (_, index) => {
      const date = new Date()
      date.setHours(12, 0, 0, 0)
      date.setDate(date.getDate() - (29 - index))
      const entries = grouped.get(dayKey(date)) ?? []
      const score = entries.length
        ? entries.reduce((sum, entry) => sum + entry.score, 0) / entries.length
        : null
      return { key: dayKey(date), score, entries }
    })
  }, [snapshot.moods])

  function addDose(dose: DoseEvent) {
    setSnapshot((current) => ({
      ...current,
      doses: [dose, ...current.doses],
    }))
    setMessage('dose recorded')
  }

  function addMood(event: FormEvent) {
    event.preventDefault()
    setSnapshot((current) => ({
      ...current,
      moods: [
        {
          id: id(),
          kind: 'mood',
          score: moodScore,
          at: toIso(moodAt),
          note: moodNote.trim(),
          hashtags: parseHashtags(moodHashtags),
        },
        ...current.moods,
      ],
    }))
    setMoodNote('')
    setMoodHashtags('')
    setMoodAt(nowInput())
    setMessage('mood recorded')
  }

  function removeEntry(entryId: string) {
    setSnapshot((current) => ({
      ...current,
      doses: current.doses.filter((entry) => entry.id !== entryId),
      moods: current.moods.filter((entry) => entry.id !== entryId),
    }))
  }

  async function sync() {
    if (!token) {
      setMessage('login to sync encrypted backups')
      return
    }
    setSyncState('saving')
    setMessage('')
    try {
      await saveEncryptedBackup(token, snapshot)
      setSyncState('synced')
      setMessage('encrypted backup saved')
    } catch (error) {
      setSyncState('local')
      setMessage(error instanceof Error ? error.message : 'sync failed')
    }
  }

  async function restore() {
    if (!token) {
      setMessage('login to load encrypted backups')
      return
    }
    setSyncState('loading')
    setMessage('')
    try {
      const restored = await loadLatestEncryptedBackup(token)
      if (!restored || typeof restored !== 'object') {
        setMessage('no backup found')
        setSyncState('local')
        return
      }
      setSnapshot(restored as HealthSnapshot)
      setSyncState('synced')
      setMessage('encrypted backup loaded')
    } catch (error) {
      setSyncState('local')
      setMessage(error instanceof Error ? error.message : 'load failed')
    }
  }

  return (
    <section className="health-console">
      <div className="console-toolbar">
        <div>
          <p className="section-label">[ health: work in progress]</p>
          <h1 className="console-title">hrt / meds / mood</h1>
          
        </div>
        <div className="sync-actions">
          <span className={`sync-state sync-${syncState}`}>
            {guest ? 'guest / local' : syncState}
          </span>
          <button
            className="button button-quiet"
            onClick={restore}
            disabled={syncState === 'loading'}
          >
            load
          </button>
          <button
            className="button button-quiet"
            onClick={sync}
            disabled={syncState === 'saving'}
          >
            save encrypted
          </button>
        </div>
      </div>

      <nav className="page-nav" aria-label="Health pages">
        {(
          [
            ['overview', 'overview'],
            ['history', 'history'],
            ['calibration', 'calibration'],
            ['mood', 'mood'],
          ] as const
        ).map(([value, label]) => (
          <button
            className={
              page === value ? 'page-nav-button active' : 'page-nav-button'
            }
            key={value}
            onClick={() => setPage(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      {page === 'overview' && (
        <div className="overview-grid">
          <HrtDoseForm onSave={addDose} />
          <ConcentrationGraph snapshot={snapshot} />
        </div>
      )}

      {page === 'history' && (
        <HistoryPage timeline={timeline} removeEntry={removeEntry} />
      )}

      {page === 'calibration' && <CalibrationPage doses={snapshot.doses} />}

      {page === 'mood' && (
        <MoodPage
          moodAt={moodAt}
          moodNote={moodNote}
          moodHashtags={moodHashtags}
          moodScore={moodScore}
          moodDays={moodDays}
          moods={snapshot.moods}
          setMoodAt={setMoodAt}
          setMoodNote={setMoodNote}
          setMoodHashtags={setMoodHashtags}
          setMoodScore={setMoodScore}
          onSubmit={addMood}
          removeEntry={removeEntry}
        />
      )}

      <p className="console-message muted">{message}</p>
    </section>
  )
}

function HistoryPage({
  timeline,
  removeEntry,
}: {
  timeline: Array<DoseEvent | MoodEntry>
  removeEntry: (id: string) => void
}) {
  return (
    <div className="box timeline-card history-page">
      <div className="timeline-head">
        <div>
          <p className="section-label">[ history ]</p>
          <h2>{timeline.length} records</h2>
        </div>
        <span className="muted">newest first</span>
      </div>
      {timeline.length === 0 ? (
        <p className="muted">No records.</p>
      ) : (
        <div className="timeline-list">
          {timeline.map((entry) => (
            <TimelineEntry
              key={entry.id}
              entry={entry}
              removeEntry={removeEntry}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TimelineEntry({
  entry,
  removeEntry,
}: {
  entry: DoseEvent | MoodEntry
  removeEntry: (id: string) => void
}) {
  return (
    <div className="timeline-entry">
      <time>{entryTime(entry.at)}</time>
      {entry.kind === 'dose' ? (
        <span>
          <strong>
            {entry.formulation ?? medicationLabels[entry.medication]}
          </strong>{' '}
          /{' '}
          {entry.extras?.releaseRateUGPerDay
            ? `${entry.extras.releaseRateUGPerDay} µg/day`
            : `${entry.dose} mg`}{' '}
          / {routeLabels[entry.route]}
          {entry.note && ` / ${entry.note}`}
        </span>
      ) : (
        <span>
          <strong>mood {entry.score}/5</strong>
          {entry.note && ` / ${entry.note}`}
          {entry.hashtags?.length ? ` / ${entry.hashtags.join(' ')}` : ''}
        </span>
      )}
      <button
        className="delete-button"
        onClick={() => removeEntry(entry.id)}
        aria-label="delete record"
      >
        x
      </button>
    </div>
  )
}

function CalibrationPage({ doses }: { doses: DoseEvent[] }) {
  const hasHrt = doses.some(
    (dose) =>
      dose.medication === 'estradiol' || dose.medication === 'testosterone',
  )
  return (
    <div className="calibration-grid">
      <article className="box calibration-card form-green">
        <p className="section-label">[ hrt ]</p>
        <h2>pharmacokinetics</h2>
        {/* <p className="calibration-state">
          {hasHrt ? 'events present' : 'waiting for events'}
        </p> */}
        <p className="muted">
          estradiol, testosterone and CPA exponential decay models + interaction logic from hrt.mahiro.uk.
        </p>
        <a href="https://github.com/LaoZhong-Mihari/HRT-Recorder-online" target="_blank" rel="noreferrer">
          upstream repo
        </a>
      </article>
      <article className="box calibration-card form-turquoise">
        <p className="section-label">[ concerta ]</p>
        <h2>population curve</h2>
        {/* <p className="calibration-state">label anchored</p> */}
        <p className="muted">22% immediate plus 78% osmotic Bateman model, with peaks around
2.5 h and 7 h in a 24-hour visualization. The dose selector permits 18 mg
plus 9 mg increments</p>
      </article>
      <article className="box calibration-card form-lavender">
        <p className="section-label">[ nac ]</p>
        {/* <h2>not calibrated</h2> */}
        <p className="muted">
          using simple exponential decay model with half life of 6.25h for oral administration
        </p>
      </article>
    </div>
  )
}

function MoodPage({
  moodAt,
  moodNote,
  moodHashtags,
  moodScore,
  moodDays,
  moods,
  setMoodAt,
  setMoodNote,
  setMoodHashtags,
  setMoodScore,
  onSubmit,
  removeEntry,
}: {
  moodAt: string
  moodNote: string
  moodHashtags: string
  moodScore: MoodEntry['score']
  moodDays: Array<{ key: string; score: number | null; entries: MoodEntry[] }>
  moods: MoodEntry[]
  setMoodAt: (value: string) => void
  setMoodNote: (value: string) => void
  setMoodHashtags: (value: string) => void
  setMoodScore: (value: MoodEntry['score']) => void
  onSubmit: (event: FormEvent) => void
  removeEntry: (id: string) => void
}) {
  return (
    <div className="mood-page">
      <form
        className="box form-card form-lavender mood-form"
        onSubmit={onSubmit}
      >
        <p className="section-label">[ observation ]</p>
        <h2>mood</h2>
        <div className="mood-scale" role="radiogroup" aria-label="mood score">
          {([1, 2, 3, 4, 5] as const).map((score) => (
            <button
              key={score}
              type="button"
              className={
                moodScore === score ? 'mood-score selected' : 'mood-score'
              }
              onClick={() => setMoodScore(score)}
              aria-pressed={moodScore === score}
            >
              {score}
            </button>
          ))}
        </div>
        <label>
          time
          <input
            type="datetime-local"
            value={moodAt}
            onChange={(event) => setMoodAt(event.target.value)}
          />
        </label>
        <label>
          note
          <textarea
            value={moodNote}
            onChange={(event) => setMoodNote(event.target.value)}
            placeholder="optional"
            rows={4}
          />
        </label>
        <label>
          hashtags
          <input
            value={moodHashtags}
            onChange={(event) => setMoodHashtags(event.target.value)}
            placeholder="#insomnia #chronicallyonline"
          />
        </label>
        <button className="button button-primary" type="submit">
          record mood
        </button>
      </form>

      <section className="box mood-history-card">
        <div className="timeline-head">
          <div>
            <p className="section-label">[ last 30 days ]</p>
            <h2>{moods.length} check-ins</h2>
          </div>
          <span className="muted">git-style daily boxes</span>
        </div>
        <div
          className="mood-commit-grid"
          role="img"
          aria-label="mood history for the last 30 days"
        >
          {moodDays.map((day) => (
            <span
              className={`mood-commit mood-commit-${day.score ? Math.round(day.score) : 'empty'}`}
              key={day.key}
              title={`${day.key}: ${day.score ?? 'not recorded'}`}
            />
          ))}
        </div>
        <div className="mood-commit-legend">
          <span>low</span>
          {[1, 2, 3, 4, 5].map((score) => (
            <span className={`mood-commit mood-commit-${score}`} key={score}>
              {score}
            </span>
          ))}
          <span>high</span>
        </div>
        <div className="mood-hashtags">
          <p className="section-label">[ hashtags ]</p>
          {hashtagCloud(moods).length === 0 ? (
            <span className="muted">No hashtags.</span>
          ) : (
            hashtagCloud(moods).map((tag) => (
              <span
                key={tag.name}
                className="mood-hashtag"
                style={{ fontSize: `${0.72 + (tag.count / tag.max) * 0.8}rem` }}
              >
                {tag.name}
              </span>
            ))
          )}
        </div>
      </section>

      <section className="box mood-log-card">
        <div className="timeline-head">
          <div>
            <p className="section-label">[ mood log ]</p>
            <h2>all check-ins</h2>
          </div>
          <span className="muted">newest first</span>
        </div>
        {moods.length === 0 ? (
          <p className="muted">No mood records.</p>
        ) : (
          <div className="timeline-list">
            {[...moods]
              .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
              .map((entry) => (
                <TimelineEntry
                  key={entry.id}
                  entry={entry}
                  removeEntry={removeEntry}
                />
              ))}
          </div>
        )}
      </section>
    </div>
  )
}
