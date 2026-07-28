import { methylphenidateAt } from './model'
import {
  ExtraKey,
  Ester,
  interpolateConcentration_CPA,
  interpolateConcentration_E2,
  interpolateConcentration_T,
  Route,
  runSimulation,
  type SimulationResult,
} from './models/hrt/logic'
import type { DoseEvent, DoseRoute, HealthSnapshot } from './types'

export type AnalyteKey =
  'estradiol' | 'testosterone' | 'cyproterone' | 'methylphenidate' | 'nac'

export interface GraphSeries {
  key: AnalyteKey
  label: string
  unit: string
  color: string
  confidence:
    | 'upstream'
    | 'provisional'
    | 'population'
    | 'oyama model'
    | 'population study'
    | 'half life 6.25h'
  values: number[]
}

export interface ConcentrationFrame {
  startAt: number
  endAt: number
  times: number[]
  series: GraphSeries[]
  planned: Array<{ at: number; key: AnalyteKey; label: string; color: string }>
}

const HOURS = 3_600_000
const DEFAULT_WEIGHT_KG = 70

const routeMap: Record<DoseRoute, Route> = {
  oral: Route.oral,
  injection: Route.injection,
  patch: Route.patchApply,
  patchApply: Route.patchApply,
  patchRemove: Route.patchRemove,
  gel: Route.gel,
  sublingual: Route.sublingual,
  other: Route.oral,
}

function toUpstreamEvent(dose: DoseEvent) {
  if (!dose.formulation) return null
  const extras: Partial<Record<ExtraKey, number>> = {}
  if (dose.extras?.releaseRateUGPerDay !== undefined)
    extras[ExtraKey.releaseRateUGPerDay] = dose.extras.releaseRateUGPerDay
  if (dose.extras?.sublingualTheta !== undefined)
    extras[ExtraKey.sublingualTheta] = dose.extras.sublingualTheta
  if (dose.extras?.sublingualTier !== undefined)
    extras[ExtraKey.sublingualTier] = dose.extras.sublingualTier
  if (dose.extras?.gelSite !== undefined)
    extras[ExtraKey.gelSite] = dose.extras.gelSite
  if (dose.extras?.patchWearH !== undefined)
    extras[ExtraKey.patchWearH] = dose.extras.patchWearH

  return {
    id: dose.id,
    route: routeMap[dose.route],
    timeH: Date.parse(dose.at) / HOURS,
    doseMG: dose.dose,
    ester: dose.formulation as unknown as Ester,
    extras,
  }
}

export function buildHrtSimulation(
  snapshot: HealthSnapshot,
  weightKG = DEFAULT_WEIGHT_KG,
): SimulationResult | null {
  const events = snapshot.doses
    .filter(
      (dose) =>
        dose.medication === 'estradiol' ||
        dose.medication === 'testosterone' ||
        dose.medication === 'cyproterone',
    )
    .map(toUpstreamEvent)
    .filter(
      (event): event is NonNullable<ReturnType<typeof toUpstreamEvent>> =>
        event !== null,
    )
  return runSimulation(events, weightKG)
}

function bateman(elapsed: number, ka: number, ke: number): number {
  if (elapsed < 0) return 0
  const tMax = Math.log(ka / ke) / (ka - ke)
  const peak = Math.exp(-ke * tMax) - Math.exp(-ka * tMax)
  return (Math.exp(-ke * elapsed) - Math.exp(-ka * elapsed)) / peak
}

function nacValue(dose: DoseEvent, elapsed: number): number {
  if (elapsed < 0) return 0
  // Total NAC population curve: oral 600 mg studies report approximately
  // 1-2 h Tmax and roughly 6 h terminal half-life; exposure is variable.
  return (dose.dose / 600) * 2500 * bateman(elapsed, 2.2, Math.log(2) / 6.25)
}

function valueAt(
  key: AnalyteKey,
  doses: DoseEvent[],
  now: number,
  simulation: SimulationResult | null,
): number {
  const hour = now / HOURS
  if (simulation) {
    if (key === 'estradiol')
      return interpolateConcentration_E2(simulation, hour) ?? 0
    if (key === 'testosterone')
      return interpolateConcentration_T(simulation, hour) ?? 0
    if (key === 'cyproterone')
      return interpolateConcentration_CPA(simulation, hour) ?? 0
  }
  return doses.reduce((total, dose) => {
    const elapsed = (now - Date.parse(dose.at)) / HOURS
    if (key === 'methylphenidate' && dose.medication === key)
      return total + methylphenidateAt([dose], now)
    if (key === 'nac' && dose.medication === key)
      return total + nacValue(dose, elapsed)
    return total
  }, 0)
}

export function buildConcentrationFrame(
  snapshot: HealthSnapshot,
  windowHours: number,
  now = Date.now(),
  points?: number,
): ConcentrationFrame {
  const futureTimes = snapshot.doses
    .map((dose) => Date.parse(dose.at))
    .filter((time) => time > now)
  const hasFuture = futureTimes.length > 0
  const latestFuture = Math.max(...futureTimes, now)
  const startAt = hasFuture
    ? Math.min(now - windowHours * HOURS, latestFuture - windowHours * HOURS)
    : now - windowHours * HOURS
  const endAt = hasFuture ? latestFuture + 24 * HOURS : now
  const samplePoints =
    points ??
    (windowHours === 24 ? Math.ceil((endAt - startAt) / HOURS) + 1 : 96)
  const times = Array.from(
    { length: samplePoints },
    (_, index) =>
      startAt + (index / Math.max(1, samplePoints - 1)) * (endAt - startAt),
  )
  const simulation = buildHrtSimulation(snapshot)
  const definitions: Array<
    [AnalyteKey, string, string, string, GraphSeries['confidence']]
  > = [
    ['estradiol', 'estradiol', 'pg/mL', '#00fcb5', 'oyama model'],
    ['testosterone', 'testosterone', 'ng/dL', '#00fc50', 'oyama model'],
    ['cyproterone', 'CPA', 'ng/mL', '#9058f8', 'oyama model'],
    [
      'methylphenidate',
      'methylphenidate',
      'ng/mL',
      '#7287fd',
      'population study',
    ],
    ['nac', 'NAC', 'ng/mL', '#f5a9b8', 'half life 6.25h'],
  ]
  return {
    startAt,
    endAt,
    times,
    series: definitions.map(([key, label, unit, color, confidence]) => ({
      key,
      label,
      unit,
      color,
      confidence,
      values: times.map((time) =>
        valueAt(key, snapshot.doses, time, simulation),
      ),
    })),
    planned: snapshot.doses.flatMap((dose) => {
      const at = Date.parse(dose.at)
      if (!(at > now)) return []
      const key = dose.medication as AnalyteKey
      const definition = definitions.find(([seriesKey]) => seriesKey === key)
      if (!definition) return []
      return [{ at, key, label: 'planned', color: definition[3] }]
    }),
  }
}
