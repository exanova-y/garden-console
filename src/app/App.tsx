import { useState } from 'react'
import { GrainGradient } from '@paper-design/shaders-react'
import wallpaperUrl from '../../djmax-respect-v.png'
import { HealthConsole } from '../features/health/HealthConsole'
import { ReadingConsole } from '../features/reading/ReadingConsole'

type Workspace = 'health' | 'reading'

export function App() {
  const [workspace, setWorkspace] = useState<Workspace>(() =>
    new URLSearchParams(window.location.search).get('workspace') === 'reading'
      ? 'reading'
      : 'health',
  )
  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches

  return (
    <div className="scene">
      <div
        className="wallpaper"
        style={{ backgroundImage: `url(${wallpaperUrl})` }}
        aria-hidden="true"
      />
      <div className="shader" aria-hidden="true">
        <GrainGradient
          width="100%"
          height="100%"
          colors={['#7287fd', '#9058f8', '#00fcb5', '#f5a9b8']}
          colorBack="#0f1228"
          softness={0.72}
          intensity={0.38}
          noise={0.32}
          shape="wave"
          speed={reduceMotion ? 0 : 0.12}
          scale={1.15}
          maxPixelCount={650_000}
        />
      </div>

      <div className="app-frame">
        <nav className="activity-rail" aria-label="Workspaces">
          <button
            className={
              workspace === 'health'
                ? 'activity-button active'
                : 'activity-button'
            }
            onClick={() => setWorkspace('health')}
            title="Health"
          >
            H
          </button>
          <button
            className={
              workspace === 'reading'
                ? 'activity-button active'
                : 'activity-button'
            }
            onClick={() => setWorkspace('reading')}
            title="Reading"
          >
            R
          </button>
        </nav>
        <main
          className={workspace === 'reading' ? 'shell shell-reading' : 'shell'}
        >
          {/* <header className="long-box masthead">
          <a href="https://adiabatic.garden">adiabatic.garden</a>
          <span>garden console</span>
        </header> */}

          {workspace === 'health' ? (
            <HealthConsole userId="guest" guest />
          ) : (
            <ReadingConsole />
          )}

          {workspace === 'health' && (
            <footer className="long-box footer">
              <span>
                <a
                  className="model-source"
                  href="https://hrt.mahiro.uk"
                  target="_blank"
                  rel="noreferrer"
                >
                  model and interaction logic reference: hrt.mahiro.uk
                </a>
                <br></br>
                in guest mode, data is saved in localStorage lasting
                indefinitely until manually clearing browser data. upon login,
                information is encrypted via AES-256 prior to sending to a
                cloudflare server.
              </span>
            </footer>
          )}
        </main>
      </div>
    </div>
  )
}
