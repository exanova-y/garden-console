const FETCH_OPTIONS = {
  cf: { cacheTtl: 300 },
  headers: {
    'User-Agent': 'peacesign-reader/1.0 (+https://peacesign.adiabatic.garden)',
  },
} as const

async function checkedResponse(url: string): Promise<Response> {
  const response = await fetch(url, FETCH_OPTIONS)
  if (!response.ok) throw new Error(`source fetch failed (${response.status})`)
  return response
}

export async function fetchJson(url: string): Promise<unknown> {
  return (await checkedResponse(url)).json()
}

export async function fetchText(url: string): Promise<string> {
  return (await checkedResponse(url)).text()
}
