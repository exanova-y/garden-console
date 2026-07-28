import { EMPTY_SNAPSHOT, type HealthSnapshot } from './types'

function key(userId: string): string {
  return `garden-console:health:${userId}`
}

export function loadHealth(userId: string): HealthSnapshot {
  try {
    const raw = localStorage.getItem(key(userId))
    if (!raw) return structuredClone(EMPTY_SNAPSHOT)
    const parsed = JSON.parse(raw) as Partial<HealthSnapshot>
    return {
      version: 1,
      doses: Array.isArray(parsed.doses) ? parsed.doses : [],
      moods: Array.isArray(parsed.moods)
        ? parsed.moods.map((entry) => ({
            ...entry,
            hashtags: Array.isArray(entry.hashtags) ? entry.hashtags : [],
          }))
        : [],
    }
  } catch {
    return structuredClone(EMPTY_SNAPSHOT)
  }
}

export function saveHealth(userId: string, snapshot: HealthSnapshot): void {
  localStorage.setItem(key(userId), JSON.stringify(snapshot))
}

export function mergeHealth(
  base: HealthSnapshot,
  overlay: HealthSnapshot,
): HealthSnapshot {
  const doses = new Map(base.doses.map((entry) => [entry.id, entry]))
  const moods = new Map(base.moods.map((entry) => [entry.id, entry]))
  for (const entry of overlay.doses) doses.set(entry.id, entry)
  for (const entry of overlay.moods) moods.set(entry.id, entry)
  return {
    version: 1,
    doses: [...doses.values()],
    moods: [...moods.values()],
  }
}

export function hasHealthData(snapshot: HealthSnapshot): boolean {
  return snapshot.doses.length > 0 || snapshot.moods.length > 0
}
