import type { DoseEvent } from './types'

interface MethylphenidateEstimate {
  value: number
  unit: 'ng/mL'
  confidence: 'population'
  note: string
}

const KE = Math.log(2) / 3.5 // terminal elimination rate (t½ = 3.5 h)

/** Normalized Bateman: peaks at 1.0 for a given absorption rate. */
function bateman(elapsed: number, ka: number): number {
  if (elapsed <= 0) return 0
  const tMax = Math.log(ka / KE) / (ka - KE)
  const peak = Math.exp(-KE * tMax) - Math.exp(-ka * tMax)
  return (Math.exp(-KE * elapsed) - Math.exp(-ka * elapsed)) / peak
}

/*
 * Concerta OROS two-component visualization:
 *   immediate component 22 % — peak ≈ 2.5 h
 *   osmotic component   78 % — peak ≈ 7 h
 *
 * Scale factor 8.2 was derived by numerically solving for the max of the
 * weighted pulse sum so that 18 mg yields Cmax ≈ 3.7 ng/mL, matching the
 * Concerta label.
 */
const OROS_PULSES = [
  { fraction: 0.22, delay: 0, ka: 0.7 },
  { fraction: 0.78, delay: 4.25, ka: 0.6 },
] as const

const OROS_SCALE = 4.0890563331

export function methylphenidateAt(doses: DoseEvent[], now: number): number {
  let value = 0

  for (const dose of doses) {
    if (dose.medication !== 'methylphenidate') continue
    const elapsed = (now - Date.parse(dose.at)) / 3_600_000
    if (elapsed < 0) continue
    const scale = dose.dose / 18
    let pulseSum = 0
    for (const p of OROS_PULSES) {
      pulseSum += p.fraction * bateman(elapsed - p.delay, p.ka)
    }
    value += OROS_SCALE * scale * pulseSum
  }

  return value
}

/**
 * Concerta OROS two-component population estimate.
 * Anchored to the FDA label (Cmax 3.7 ng/mL, t½ 3.5 h) and the Swanson et al.
 * OROS release fractions. This is a population curve, not a measurement.
 */
export function estimateMethylphenidate(
  doses: DoseEvent[],
  now = Date.now(),
): MethylphenidateEstimate | null {
  const value = methylphenidateAt(doses, now)

  if (value <= 0.01) return null
  return {
    value,
    unit: 'ng/mL',
    confidence: 'population',
    note: 'Concerta OROS two-component population estimate; not a lab result.',
  }
}
