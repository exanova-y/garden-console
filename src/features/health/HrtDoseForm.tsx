import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  medicationLabels,
  routeLabels,
  type DoseEvent,
  type DoseRoute,
  type HrtExtras,
  type HrtFormulation,
  type HrtMode,
  type Medication,
} from './types'

interface HrtDoseFormProps {
  onSave: (event: DoseEvent) => void
}

type TrackingKind = 'hrt' | 'meds'
type PatchMode = 'rate' | 'dose'
type EditedField = 'raw' | 'equivalent'

const HRT_ROUTES: DoseRoute[] = [
  'sublingual',
  'injection',
  'patchApply',
  'patchRemove',
  'gel',
  'oral',
]

const TRANSMASC_ROUTES: DoseRoute[] = ['injection', 'gel']

const FORMULATIONS: Record<HrtFormulation, { label: string; mw: number }> = {
  E2: { label: 'Estradiol', mw: 272.38 },
  EB: { label: 'Estradiol benzoate', mw: 376.5 },
  EV: { label: 'Estradiol valerate', mw: 356.5 },
  EC: { label: 'Estradiol cypionate', mw: 396.58 },
  EN: { label: 'Estradiol enanthate', mw: 384.56 },
  EU: { label: 'Estradiol undecylate', mw: 440.66 },
  CPA: { label: 'Cyproterone acetate', mw: 416.94 },
  T: { label: 'Testosterone', mw: 288.42 },
  TC: { label: 'Testosterone cypionate', mw: 412.6 },
  TE: { label: 'Testosterone enanthate', mw: 400.59 },
  TU: { label: 'Testosterone undecanoate', mw: 456.7 },
}

const SL_TIERS = [
  { label: 'quick', hold: 2, theta: 0.01 },
  { label: 'casual', hold: 5, theta: 0.04 },
  { label: 'standard', hold: 10, theta: 0.11 },
  { label: 'strict', hold: 15, theta: 0.18 },
] as const

const GEL_SITES = ['arm', 'thigh', 'scrotal'] as const
const PATCH_RATES = [25, 37.5, 50, 75, 100]
const PATCH_WEAR = [3.5, 7]

const nowInput = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)

function availableFormulations(
  mode: HrtMode,
  route: DoseRoute,
): HrtFormulation[] {
  if (mode === 'transmasc') {
    if (route === 'injection') return ['TC', 'TE', 'TU']
    return ['T']
  }
  if (route === 'injection') return ['EB', 'EV', 'EC', 'EN', 'EU']
  if (route === 'oral') return ['E2', 'EV', 'CPA']
  if (route === 'sublingual') return ['E2', 'EV']
  return ['E2']
}

function factor(formulation: HrtFormulation): number {
  if (formulation === 'E2') return 1
  if (['T', 'TC', 'TE', 'TU'].includes(formulation))
    return FORMULATIONS.T.mw / FORMULATIONS[formulation].mw
  return FORMULATIONS.E2.mw / FORMULATIONS[formulation].mw
}

function thetaFromHold(hold: number): number {
  const points = SL_TIERS.map(({ hold: x, theta: y }) => ({ x, y }))
  let left = points[0]
  let right = points[1]
  if (hold >= points.at(-1)!.x) {
    left = points.at(-2)!
    right = points.at(-1)!
  } else {
    for (let i = 0; i < points.length - 1; i++) {
      if (hold >= points[i].x && hold <= points[i + 1].x) {
        left = points[i]
        right = points[i + 1]
        break
      }
    }
  }
  return Math.max(
    0,
    Math.min(
      1,
      left.y + ((hold - left.x) / (right.x - left.x)) * (right.y - left.y),
    ),
  )
}

function gelBioavailability(mode: HrtMode, site: number): number {
  return mode === 'transmasc' ? [0.1, 0.1, 0.5][site] : [0.05, 0.05, 0.25][site]
}

export function HrtDoseForm({ onSave }: HrtDoseFormProps) {
  const [kind, setKind] = useState<TrackingKind>('hrt')
  const [mode, setMode] = useState<HrtMode>('transfem')
  const [route, setRoute] = useState<DoseRoute>('sublingual')
  const [formulation, setFormulation] = useState<HrtFormulation>('EV')
  const [rawDose, setRawDose] = useState('')
  const [equivalentDose, setEquivalentDose] = useState('')
  const [lastEdited, setLastEdited] = useState<EditedField>('equivalent')
  const [patchMode, setPatchMode] = useState<PatchMode>('rate')
  const [patchRate, setPatchRate] = useState('')
  const [patchWearDays, setPatchWearDays] = useState('')
  const [gelSite, setGelSite] = useState(0)
  const [slTier, setSlTier] = useState(2)
  const [customSublingual, setCustomSublingual] = useState(false)
  const [customHoldInput, setCustomHoldInput] = useState('10')
  const [customHoldValue, setCustomHoldValue] = useState(10)
  const [medication, setMedication] = useState<Medication>('methylphenidate')
  const [medDose, setMedDose] = useState('18')
  const [at, setAt] = useState(nowInput)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const routes = mode === 'transmasc' ? TRANSMASC_ROUTES : HRT_ROUTES
  const formulations = useMemo(
    () => availableFormulations(mode, route),
    [mode, route],
  )

  useEffect(() => {
    if (!routes.includes(route)) setRoute(routes[0])
  }, [mode, route, routes])

  useEffect(() => {
    if (!formulations.includes(formulation)) setFormulation(formulations[0])
  }, [formulation, formulations])

  useEffect(() => {
    const conversion = factor(formulation)
    if (lastEdited === 'raw' && rawDose) {
      const value = parseFloat(rawDose)
      setEquivalentDose(
        Number.isFinite(value) ? (value * conversion).toFixed(3) : '',
      )
    } else if (lastEdited === 'equivalent' && equivalentDose) {
      const value = parseFloat(equivalentDose)
      setRawDose(Number.isFinite(value) ? (value / conversion).toFixed(3) : '')
    }
  }, [formulation, route])

  function changeRaw(value: string) {
    setRawDose(value)
    setLastEdited('raw')
    const parsed = parseFloat(value)
    setEquivalentDose(
      Number.isFinite(parsed) ? (parsed * factor(formulation)).toFixed(3) : '',
    )
  }

  function changeEquivalent(value: string) {
    setEquivalentDose(value)
    setLastEdited('equivalent')
    const parsed = parseFloat(value)
    setRawDose(
      Number.isFinite(parsed) ? (parsed / factor(formulation)).toFixed(3) : '',
    )
  }

  function save(event: FormEvent) {
    event.preventDefault()
    setError('')

    if (kind === 'meds') {
      const value = Number(medDose)
      if (!Number.isFinite(value) || value <= 0) {
        setError('dose must be positive')
        return
      }
      if (medication === 'methylphenidate' && (value < 18 || value % 9 !== 0)) {
        setError('Concerta dose must be 18 mg or a multiple of 9 mg')
        return
      }
      onSave({
        id: crypto.randomUUID(),
        kind: 'dose',
        medication,
        dose: value,
        unit: 'mg',
        route: 'oral',
        at: new Date(at).toISOString(),
        note: note.trim(),
      })
      setNote('')
      return
    }

    const extras: HrtExtras = {}
    let finalDose = 0
    if (route === 'patchApply' && patchMode === 'rate') {
      const value = Number(patchRate)
      if (!Number.isFinite(value) || value <= 0) {
        setError('patch release rate must be positive')
        return
      }
      extras.releaseRateUGPerDay = value
    } else if (route !== 'patchRemove') {
      const value = Number(rawDose)
      if (!Number.isFinite(value) || value <= 0) {
        setError('dose must be positive')
        return
      }
      finalDose = value
    }

    if (route === 'sublingual') {
      if (customSublingual) {
        if (!Number.isFinite(customHoldValue) || customHoldValue < 1) {
          setError('hold time must be at least one minute')
          return
        }
        extras.sublingualTheta = thetaFromHold(customHoldValue)
      } else {
        extras.sublingualTier = slTier
      }
    }
    if (route === 'gel') extras.gelSite = gelSite
    if (route === 'patchApply') {
      const wear = Number(patchWearDays)
      if (Number.isFinite(wear) && wear > 0) extras.patchWearH = wear * 24
    }

    const selectedFormulation = ['patchApply', 'patchRemove', 'gel'].includes(
      route,
    )
      ? mode === 'transmasc'
        ? 'T'
        : 'E2'
      : formulation
    const eventMedication: Medication =
      selectedFormulation === 'CPA'
        ? 'cyproterone'
        : mode === 'transmasc'
          ? 'testosterone'
          : 'estradiol'

    onSave({
      id: crypto.randomUUID(),
      kind: 'dose',
      medication: eventMedication,
      dose: finalDose,
      unit: 'mg',
      route,
      hrtMode: mode,
      formulation: selectedFormulation,
      extras,
      at: new Date(at).toISOString(),
      note: note.trim(),
    })
    setRawDose('')
    setEquivalentDose('')
    setNote('')
  }

  const isTestosterone = mode === 'transmasc'
  const equivalentLabel = isTestosterone
    ? 'free testosterone equivalent / mg'
    : 'E2 equivalent / mg'
  const showRaw = formulation !== 'E2'
  const showEditableEquivalent =
    formulation !== 'CPA' &&
    !(
      formulation === 'EV' &&
      ['injection', 'oral', 'sublingual'].includes(route)
    )
  const gelBio = gelBioavailability(mode, gelSite)

  return (
    <form
      className="box form-card form-turquoise hrt-dose-form"
      onSubmit={save}
    >
      <p>[ intervention ]</p>
      <ToggleRow
        label="tracker"
        options={[
          ['hrt', 'HRT'],
          ['meds', 'meds'],
        ]}
        value={kind}
        onChange={(value) => setKind(value as TrackingKind)}
      />

      {kind === 'meds' ? (
        <>
          <label>
            medication
            <select
              value={medication}
              onChange={(event) =>
                setMedication(event.target.value as Medication)
              }
            >
              <option value="methylphenidate">
                {medicationLabels.methylphenidate}
              </option>
              <option value="nac">{medicationLabels.nac}</option>
            </select>
          </label>
          <label>
            {medication === 'methylphenidate'
              ? 'Concerta dose / mg'
              : 'dose / mg'}
            {medication === 'methylphenidate' ? (
              <select
                value={medDose}
                onChange={(event) => setMedDose(event.target.value)}
              >
                {Array.from({ length: 7 }, (_, index) => 18 + index * 9).map(
                  (value) => (
                    <option value={value} key={value}>
                      {value} mg
                    </option>
                  ),
                )}
              </select>
            ) : (
              <input
                type="number"
                min="0"
                step="0.001"
                value={medDose}
                onChange={(event) => setMedDose(event.target.value)}
              />
            )}
          </label>
        </>
      ) : (
        <>
          <ToggleRow
            label="HRT mode"
            options={[
              ['transfem', 'estradiol'],
              ['transmasc', 'testosterone'],
            ]}
            value={mode}
            onChange={(value) => setMode(value as HrtMode)}
          />

          <label>
            route
            <select
              value={route}
              onChange={(event) => setRoute(event.target.value as DoseRoute)}
            >
              {routes.map((value) => (
                <option value={value} key={value}>
                  {routeLabels[value]}
                </option>
              ))}
            </select>
          </label>

          {formulations.length > 1 && route !== 'patchRemove' && (
            <label>
              formulation
              <select
                value={formulation}
                onChange={(event) =>
                  setFormulation(event.target.value as HrtFormulation)
                }
              >
                {formulations.map((value) => (
                  <option value={value} key={value}>
                    {FORMULATIONS[value].label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {route === 'patchRemove' ? (
            <p className="field-hint">
              Record when an active estradiol patch is removed.
            </p>
          ) : route === 'patchApply' ? (
            <PatchFields
              mode={patchMode}
              setMode={setPatchMode}
              rate={patchRate}
              setRate={setPatchRate}
              rawDose={rawDose}
              setRawDose={changeRaw}
              wearDays={patchWearDays}
              setWearDays={setPatchWearDays}
            />
          ) : route === 'gel' ? (
            <>
              <ToggleRow
                label="application site"
                options={GEL_SITES.map((site, index) => [String(index), site])}
                value={String(gelSite)}
                onChange={(value) => setGelSite(Number(value))}
              />
              <DoseInput
                label={equivalentLabel}
                value={equivalentDose}
                onChange={changeEquivalent}
              />
              <p className="field-hint">
                bioavailability: {(gelBio * 100).toFixed(0)}%
                {Number(equivalentDose) > 0 &&
                  ` / absorbed ≈ ${(Number(equivalentDose) * gelBio).toFixed(3)} mg`}
              </p>
            </>
          ) : (
            <>
              {route === 'sublingual' && (
                <SublingualFields
                  tier={slTier}
                  setTier={setSlTier}
                  custom={customSublingual}
                  setCustom={setCustomSublingual}
                  holdInput={customHoldInput}
                  holdValue={customHoldValue}
                  setHoldInput={setCustomHoldInput}
                  setHoldValue={setCustomHoldValue}
                />
              )}
              <div className="dose-pair">
                {showRaw && (
                  <DoseInput
                    label={`${FORMULATIONS[formulation].label} / mg`}
                    value={rawDose}
                    onChange={changeRaw}
                  />
                )}
                {showEditableEquivalent && (
                  <DoseInput
                    label={equivalentLabel}
                    value={equivalentDose}
                    onChange={changeEquivalent}
                  />
                )}
              </div>
              {!showEditableEquivalent && formulation !== 'CPA' && (
                <p className="field-hint">
                  {equivalentLabel}:{' '}
                  {equivalentDose ? `${equivalentDose} mg` : '--'}
                </p>
              )}
            </>
          )}
        </>
      )}

      <label>
        time
        <input
          type="datetime-local"
          value={at}
          onChange={(event) => setAt(event.target.value)}
        />
      </label>
      <label>
        note
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="optional"
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <button className="button button-primary" type="submit">
        record dose
      </button>
    </form>
  )
}

function DoseInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.001"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0.0"
      />
    </label>
  )
}

function ToggleRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: ReadonlyArray<readonly [string, string]>
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="toggle-field">
      <span>{label}</span>
      <div className="toggle-row">
        {options.map(([option, text]) => (
          <button
            key={option}
            type="button"
            className={
              value === option ? 'toggle-button active' : 'toggle-button'
            }
            onClick={() => onChange(option)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

function PatchFields({
  mode,
  setMode,
  rate,
  setRate,
  rawDose,
  setRawDose,
  wearDays,
  setWearDays,
}: {
  mode: PatchMode
  setMode: (value: PatchMode) => void
  rate: string
  setRate: (value: string) => void
  rawDose: string
  setRawDose: (value: string) => void
  wearDays: string
  setWearDays: (value: string) => void
}) {
  return (
    <div className="route-fields">
      <ToggleRow
        label="patch input"
        options={[
          ['rate', 'release rate'],
          ['dose', 'total dose'],
        ]}
        value={mode}
        onChange={(value) => setMode(value as PatchMode)}
      />
      {mode === 'rate' ? (
        <>
          <DoseInput
            label="release rate / µg per day"
            value={rate}
            onChange={setRate}
          />
          <ChipRow
            values={PATCH_RATES}
            value={rate}
            suffix="µg/d"
            onChange={setRate}
          />
        </>
      ) : (
        <DoseInput
          label="total patch dose / mg"
          value={rawDose}
          onChange={setRawDose}
        />
      )}
      <DoseInput
        label="planned wear / days (optional)"
        value={wearDays}
        onChange={setWearDays}
      />
      <div className="chip-row">
        {PATCH_WEAR.map((value) => (
          <button
            key={value}
            type="button"
            className={Number(wearDays) === value ? 'chip active' : 'chip'}
            onClick={() => setWearDays(String(value))}
          >
            {value} d
          </button>
        ))}
        <button
          type="button"
          className={!wearDays ? 'chip active' : 'chip'}
          onClick={() => setWearDays('')}
        >
          until removed
        </button>
      </div>
    </div>
  )
}

function ChipRow({
  values,
  value,
  suffix,
  onChange,
}: {
  values: number[]
  value: string
  suffix: string
  onChange: (value: string) => void
}) {
  return (
    <div className="chip-row">
      {values.map((option) => (
        <button
          key={option}
          type="button"
          className={Number(value) === option ? 'chip active' : 'chip'}
          onClick={() => onChange(String(option))}
        >
          {option} {suffix}
        </button>
      ))}
    </div>
  )
}

function SublingualFields({
  tier,
  setTier,
  custom,
  setCustom,
  holdInput,
  holdValue,
  setHoldInput,
  setHoldValue,
}: {
  tier: number
  setTier: (value: number) => void
  custom: boolean
  setCustom: (value: boolean) => void
  holdInput: string
  holdValue: number
  setHoldInput: (value: string) => void
  setHoldValue: (value: number) => void
}) {
  function updateHold(value: string) {
    setHoldInput(value)
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed >= 1) setHoldValue(parsed)
  }

  return (
    <div className="route-fields">
      <button
        type="button"
        className="inline-toggle"
        onClick={() => setCustom(!custom)}
      >
        {custom ? 'use absorption presets' : 'use custom hold time'}
      </button>
      {custom ? (
        <>
          <label>
            hold time / min
            <input
              type="number"
              min="1"
              max="60"
              value={holdInput}
              onChange={(event) => updateHold(event.target.value)}
            />
          </label>
          <input
            aria-label="hold time"
            type="range"
            min="1"
            max="60"
            value={holdValue}
            onChange={(event) => {
              const value = Number(event.target.value)
              setHoldValue(value)
              setHoldInput(String(value))
            }}
          />
          <p className="field-hint">
            θ ≈ {thetaFromHold(holdValue).toFixed(3)}
          </p>
        </>
      ) : (
        <ToggleRow
          label="absorption"
          options={SL_TIERS.map((option, index) => [
            String(index),
            `${option.label} / ${option.hold} min`,
          ])}
          value={String(tier)}
          onChange={(value) => setTier(Number(value))}
        />
      )}
    </div>
  )
}
