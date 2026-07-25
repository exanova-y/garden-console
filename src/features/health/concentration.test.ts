import { describe, expect, it } from 'vitest'
import { buildConcentrationFrame } from './concentration'
import { methylphenidateAt } from './model'
import type { HealthSnapshot } from './types'

const now = Date.parse('2026-07-25T12:00:00.000Z')

const snapshot: HealthSnapshot = {
  version: 1,
  moods: [],
  doses: [
    {
      id: 'e2',
      kind: 'dose',
      medication: 'estradiol',
      dose: 2,
      unit: 'mg',
      route: 'oral',
      formulation: 'E2',
      at: '2026-07-25T08:00:00.000Z',
      note: '',
    },
    {
      id: 'concerta',
      kind: 'dose',
      medication: 'methylphenidate',
      dose: 18,
      unit: 'mg',
      route: 'oral',
      at: '2026-07-25T07:00:00.000Z',
      note: '',
    },
    {
      id: 'nac',
      kind: 'dose',
      medication: 'nac',
      dose: 600,
      unit: 'mg',
      route: 'oral',
      at: '2026-07-25T06:00:00.000Z',
      note: '',
    },
  ],
}

describe('concentration graph series', () => {
  it('models Concerta as 22% immediate plus 78% osmotic Bateman components', () => {
    const dose = snapshot.doses.find(
      (entry) => entry.medication === 'methylphenidate',
    )!
    const doseTime = Date.parse(dose.at)
    const values = Array.from({ length: 97 }, (_, index) =>
      methylphenidateAt([dose], doseTime + index * 15 * 60_000),
    )
    const peaks = values.filter(
      (value, index) =>
        index > 0 &&
        index < values.length - 1 &&
        value > values[index - 1] &&
        value >= values[index + 1] &&
        value > 0.2,
    )
    expect(peaks).toHaveLength(2)
    expect(values[10]).toBeGreaterThan(values[9])
    expect(values[11]).toBeLessThan(values[10])
    expect(values[27]).toBeGreaterThan(values[26])
    expect(values[28]).toBeLessThan(values[27])
  })

  it('emits distinct analytes with native units', () => {
    const frame = buildConcentrationFrame(snapshot, 24, now, 25)
    expect(frame.times).toHaveLength(25)
    expect(frame.times[1] - frame.times[0]).toBe(60 * 60_000)
    expect(frame.series.map((series) => [series.key, series.unit])).toEqual([
      ['estradiol', 'pg/mL'],
      ['testosterone', 'ng/dL'],
      ['cyproterone', 'ng/mL'],
      ['methylphenidate', 'ng/mL'],
      ['nac', 'ng/mL'],
    ])
    expect(
      frame.series
        .find((series) => series.key === 'estradiol')
        ?.values.some((value) => value > 0),
    ).toBe(true)
    expect(
      frame.series
        .find((series) => series.key === 'methylphenidate')
        ?.values.some((value) => value > 0),
    ).toBe(true)
    expect(
      frame.series
        .find((series) => series.key === 'nac')
        ?.values.some((value) => value > 0),
    ).toBe(true)
  })

  it('expands to show a future planned concentration', () => {
    const future: HealthSnapshot = {
      ...snapshot,
      doses: snapshot.doses.map((dose) => ({
        ...dose,
        at: '2026-07-26T12:00:00.000Z',
      })),
    }
    const frame = buildConcentrationFrame(future, 24, now, 24)
    expect(frame.endAt).toBeGreaterThan(now)
    expect(frame.planned).toHaveLength(3)
    expect(
      frame.series
        .find((series) => series.key === 'estradiol')
        ?.values.some((value) => value > 0),
    ).toBe(true)
  })
})
