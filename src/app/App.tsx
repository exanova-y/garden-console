import { GrainGradient } from '@paper-design/shaders-react'
import wallpaperUrl from '../../djmax-respect-v.png'

const modules = [
  {
    name: 'interventions',
    mark: 'u(t)',
    items: 'hrt / concerta 18 mg / nac 600 mg',
    state: 'modeling',
    accent: 'turquoise',
  },
  {
    name: 'observations',
    mark: 'y(t)',
    items: 'mood / sleep / labs',
    state: 'queued',
    accent: 'lavender',
  },
  {
    name: 'weekly updates',
    mark: 'w(t)',
    items: 'experiments / reading / qol / habits',
    state: 'linked',
    accent: 'green',
  },
  {
    name: 'reading',
    mark: 'r(t)',
    items: 'feedly / substacks / saved',
    state: 'queued',
    accent: 'purple',
  },
] as const

export function App() {
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

      <main className="shell">
        <header className="long-box masthead">
          <a href="https://adiabatic.garden">adiabatic.garden</a>
          <span>garden console</span>
          <span className="muted">stage 1</span>
        </header>

        <section className="hero-grid">
          <div className="box hero-copy">
            <p className="section-label">[ console ]</p>
            <h1>health / mood / reading</h1>
            <p className="equation">u(t) -&gt; x-hat(t) -&gt; y(t)</p>
          </div>

          <aside className="box system-state">
            <p className="section-label">[ state ]</p>
            <dl>
              <div>
                <dt>build</dt>
                <dd>foundation</dd>
              </div>
              <div>
                <dt>auth</dt>
                <dd>next</dd>
              </div>
              <div>
                <dt>sync</dt>
                <dd>offline</dd>
              </div>
            </dl>
          </aside>
        </section>

        <section className="module-grid" aria-label="Console modules">
          {modules.map((module, index) => (
            <article
              className={`box module module-${module.accent}`}
              key={module.name}
            >
              <div className="module-head">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <span>{module.mark}</span>
              </div>
              <div>
                <h2>{module.name}</h2>
                <p>{module.items}</p>
              </div>
              <p className="module-state">{module.state}</p>
            </article>
          ))}
        </section>

        <footer className="long-box footer">
          <span>private by default</span>
          <span className="signal">signal present</span>
        </footer>
      </main>
    </div>
  )
}
