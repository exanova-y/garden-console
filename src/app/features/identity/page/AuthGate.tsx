import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  ApiError,
  clearClientAuth,
  establishCloudKey,
  login,
  register,
  session,
  type ClientUser,
} from './client'
import { loadLatestEncryptedBackup, saveEncryptedBackup } from './client'
import {
  hasHealthData,
  loadHealth,
  mergeHealth,
  saveHealth,
} from '../../health/page/store'
import { EMPTY_SNAPSHOT } from '../../health/page/types'

interface AuthGateProps {
  children: (auth: {
    token?: string
    user: ClientUser
    guest: boolean
    logout: () => void
    login: () => void
  }) => ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const [token, setToken] = useState(() => localStorage.getItem('auth_token'))
  const [user, setUser] = useState<ClientUser | null>(() => {
    const raw = localStorage.getItem('auth_user')
    try {
      return raw ? (JSON.parse(raw) as ClientUser) : null
    } catch {
      return null
    }
  })
  const [checking, setChecking] = useState(Boolean(token))
  const [guest, setGuest] = useState(false)

  useEffect(() => {
    if (!token) return
    session(token)
      .then((result) => {
        if (!result.authenticated || !result.user) {
          clearClientAuth()
          setToken(null)
          setUser(null)
          return
        }
        setUser(result.user)
        localStorage.setItem('auth_user', JSON.stringify(result.user))
      })
      .catch(() => {
        clearClientAuth()
        setToken(null)
        setUser(null)
      })
      .finally(() => setChecking(false))
  }, [token])

  async function acceptAuth(
    nextToken: string,
    nextUser: ClientUser,
    password: string,
  ) {
    await establishCloudKey(password, nextUser.id)
    const guestSnapshot = loadHealth('guest')
    const accountSnapshot = loadHealth(nextUser.id)
    let cloudSnapshot = EMPTY_SNAPSHOT
    try {
      const remote = await loadLatestEncryptedBackup(nextToken)
      if (remote && typeof remote === 'object')
        cloudSnapshot = remote as typeof EMPTY_SNAPSHOT
    } catch {
      // Login should still work when an account has no readable backup.
    }
    const merged = mergeHealth(
      mergeHealth(cloudSnapshot, accountSnapshot),
      guestSnapshot,
    )
    saveHealth(nextUser.id, merged)
    if (hasHealthData(merged)) {
      try {
        await saveEncryptedBackup(nextToken, merged)
      } catch {
        // Local data remains available; the user can retry sync in the app.
      }
    }
    saveHealth('guest', EMPTY_SNAPSHOT)
    localStorage.setItem('auth_token', nextToken)
    localStorage.setItem('auth_user', JSON.stringify(nextUser))
    setToken(nextToken)
    setUser(nextUser)
    setGuest(false)
  }

  function logout() {
    clearClientAuth()
    setToken(null)
    setUser(null)
    setGuest(true)
  }

  function continueAsGuest() {
    setGuest(true)
  }

  function showLogin() {
    setGuest(false)
  }

  if (checking) return <div className="auth-loading">checking session</div>
  if (token && user)
    return (
      <>{children({ token, user, guest: false, logout, login: showLogin })}</>
    )
  if (guest)
    return (
      <>
        {children({
          user: { id: 'guest', username: 'guest', isAdmin: false },
          guest: true,
          logout,
          login: showLogin,
        })}
      </>
    )
  return <AuthPanel onAuth={acceptAuth} onGuest={continueAsGuest} />
}

function AuthPanel({
  onAuth,
  onGuest,
}: {
  onAuth: (token: string, user: ClientUser, password: string) => Promise<void>
  onGuest: () => void
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [needsTotp, setNeedsTotp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result =
        mode === 'register'
          ? await register(username, password)
          : await login(username, password, needsTotp ? totp : undefined)
      await onAuth(result.token, result.user, password)
    } catch (caught) {
      if (caught instanceof ApiError) {
        const body = caught.body as { needs2FA?: boolean; method?: string }
        if (body?.needs2FA && body.method === 'totp') {
          setNeedsTotp(true)
          setError('2FA code required')
        } else {
          setError(caught.message)
        }
      } else {
        setError(caught instanceof Error ? caught.message : 'request failed')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="box auth-card">
        <p className="section-label">[ peacesign ]</p>
        <h1>{mode === 'login' ? 'login' : 'register'}</h1>
        <p className="muted">
          health records stay local until you save an encrypted backup.
        </p>
        <button className="button button-quiet guest-button" onClick={onGuest}>
          continue without account
        </button>
        <p className="auth-divider">or</p>
        <form onSubmit={submit}>
          <label>
            username
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label>
            password
            <input
              type="password"
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {needsTotp && (
            <label>
              2FA code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={totp}
                onChange={(event) => setTotp(event.target.value)}
                required
              />
            </label>
          )}
          {error && <p className="form-error">{error}</p>}
          <button
            className="button button-primary"
            type="submit"
            disabled={busy}
          >
            {busy ? 'working' : mode === 'login' ? 'login' : 'create account'}
          </button>
        </form>
        <button
          className="button button-quiet auth-switch"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setNeedsTotp(false)
            setError('')
          }}
        >
          {mode === 'login' ? 'new account' : 'existing account'}
        </button>
      </section>
    </main>
  )
}
