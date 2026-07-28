export type Medication =
  'estradiol' | 'testosterone' | 'cyproterone' | 'methylphenidate' | 'nac'

export type DoseRoute =
  | 'oral'
  | 'injection'
  | 'patch'
  | 'patchApply'
  | 'patchRemove'
  | 'gel'
  | 'sublingual'
  | 'other'

export type HrtMode = 'transfem' | 'transmasc'

export type HrtFormulation =
  'E2' | 'EB' | 'EV' | 'EC' | 'EN' | 'EU' | 'CPA' | 'T' | 'TC' | 'TE' | 'TU'

export interface HrtExtras {
  releaseRateUGPerDay?: number
  sublingualTheta?: number
  sublingualTier?: number
  gelSite?: number
  patchWearH?: number
}

export interface DoseEvent {
  id: string
  kind: 'dose'
  medication: Medication
  dose: number
  unit: 'mg'
  route: DoseRoute
  hrtMode?: HrtMode
  formulation?: HrtFormulation
  extras?: HrtExtras
  at: string
  note: string
}

export interface MoodEntry {
  id: string
  kind: 'mood'
  score: 1 | 2 | 3 | 4 | 5
  at: string
  note: string
  hashtags: string[]
}

export interface HealthSnapshot {
  version: 1
  doses: DoseEvent[]
  moods: MoodEntry[]
}

export const EMPTY_SNAPSHOT: HealthSnapshot = {
  version: 1,
  doses: [],
  moods: [],
}

export const medicationLabels: Record<Medication, string> = {
  estradiol: 'estradiol',
  testosterone: 'testosterone',
  cyproterone: 'cyproterone acetate',
  methylphenidate: 'Concerta / methylphenidate ER',
  nac: 'NAC',
}

export const routeLabels: Record<DoseRoute, string> = {
  oral: 'oral',
  injection: 'injection',
  patch: 'patch',
  patchApply: 'patch apply',
  patchRemove: 'patch remove',
  gel: 'gel',
  sublingual: 'sublingual',
  other: 'other',
}
