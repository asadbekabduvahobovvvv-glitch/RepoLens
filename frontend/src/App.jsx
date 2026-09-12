import { useEffect, useMemo, useState } from 'react'
import './App.css'
import './onboarding.css'
import './theme.css'
import './interaction.css'
import {
  LANGUAGES,
  translate,
} from './i18n'

const EXTENSIONS = {
  py: 'Python',
  js: 'JavaScript',
  jsx: 'React JSX',
  ts: 'TypeScript',
  tsx: 'React TSX',
  java: 'Java',
  go: 'Go',
  rs: 'Rust',
  cpp: 'C++',
  c: 'C',
  cs: 'C#',
  php: 'PHP',
  rb: 'Ruby',
}


const INTERACTION_TEXT = {
  en: {
    tryDemo: 'Try demo',
    demoLoading: 'Loading demo…',
    demoHint: 'No repository ready? Launch a built-in sample project.',
    graphHint: 'Click a node to highlight its direct architecture relationships.',
  },
  uz: {
    tryDemo: 'Demoni sinash',
    demoLoading: 'Demo yuklanmoqda…',
    demoHint: "Repozitoriy tayyor emasmi? Ichki namuna loyiha bilan sinab ko'ring.",
    graphHint: "Bog'lanishlarni ajratib ko'rsatish uchun grafdagi faylni bosing.",
  },
  de: {
    tryDemo: 'Demo testen',
    demoLoading: 'Demo wird geladen…',
    demoHint: 'Kein Repository bereit? Starte das integrierte Beispielprojekt.',
    graphHint: 'Klicke auf einen Knoten, um seine direkten Beziehungen hervorzuheben.',
  },
  ru: {
    tryDemo: 'Запустить демо',
    demoLoading: 'Демо загружается…',
    demoHint: 'Нет готового репозитория? Запустите встроенный пример.',
    graphHint: 'Нажмите на узел, чтобы выделить его прямые связи.',
  },
}

function shortName(path = '') {
  return path.split('/').filter(Boolean).pop() || path
}

function extension(path = '') {
  const name = shortName(path)
  return name.includes('.') ? name.split('.').pop().toLowerCase() : ''
}

function buildEdges(files, pythonAnalysis) {
  const edges = []
  const sourceFiles = files || []

  for (const [source, info] of Object.entries(pythonAnalysis || {})) {
    for (const imported of info.imports || []) {
      const parts = imported.replace(/^\.+/, '').split('.')
      const moduleName = parts[0]

      if (!moduleName) continue

      const target = sourceFiles.find((candidate) => {
        const file = shortName(candidate)
        const stem = file.replace(/\.[^.]+$/, '')
        return stem === moduleName && candidate !== source
      })

      if (target) {
        const key = `${source}->${target}`

        if (!edges.some((edge) => edge.key === key)) {
          edges.push({
            key,
            source,
            target,
          })
        }
      }
    }
  }

  return edges
}

function FileTree({ tree, depth = 0 }) {
  if (!tree || typeof tree !== 'object') return null

  return (
    <div className="tree-group">
      {Object.entries(tree).map(([name, children]) => {
        const childObject =
          children && typeof children === 'object' ? children : {}

        const isFolder = Object.keys(childObject).length > 0

        return (
          <div key={`${depth}-${name}`}>
            <div
              className="tree-row"
              style={{ paddingLeft: `${depth * 18 + 8}px` }}
            >
              <span className="tree-icon">
                {isFolder ? '▾' : '◇'}
              </span>
              <span>{name}</span>
            </div>

            {isFolder && (
              <FileTree
                tree={childObject}
                depth={depth + 1}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function MetricCard({ label, value, detail }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">{detail}</div>
    </div>
  )
}

function DependencyGraph({
  files,
  analysis,
  edges: suppliedEdges = [],
  selectedFile,
  onSelectFile,
  t,
}) {
  const nodes = (files || []).slice(0, 10)
  const allEdges = suppliedEdges.length
    ? suppliedEdges
    : buildEdges(files, analysis)
  const edges = allEdges.filter(
    (edge) =>
      nodes.includes(edge.source) &&
      nodes.includes(edge.target),
  )

  const width = 760
  const height = 350
  const centerX = width / 2
  const centerY = height / 2
  const radiusX = 285
  const radiusY = 125

  const positions = {}

  nodes.forEach((file, index) => {
    const angle =
      nodes.length === 1
        ? 0
        : (Math.PI * 2 * index) / nodes.length - Math.PI / 2

    positions[file] = {
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY,
    }
  })

  if (!nodes.length) {
    return (
      <div className="empty-state">
        {t('architectureEmpty')}
      </div>
    )
  }

  return (
    <div className="graph-shell">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="graph-svg"
        role="img"
        aria-label={t('graphAria')}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 0 L 10 5 L 0 10 z"
              className="arrow-head"
            />
          </marker>
        </defs>

        {edges.map((edge) => {
          const start = positions[edge.source]
          const end = positions[edge.target]

          if (!start || !end) return null

          return (
            <line
              key={edge.key}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              className={
                `graph-edge${
                  selectedFile
                    ? edge.source === selectedFile || edge.target === selectedFile
                      ? ' graph-edge-active'
                      : ' graph-edge-muted'
                    : ''
                }`
              }
              markerEnd="url(#arrow)"
            />
          )
        })}

        {nodes.map((file) => {
          const point = positions[file]
          const isSelected = selectedFile === file
          const isRelated = Boolean(
            selectedFile &&
            edges.some(
              (edge) =>
                (edge.source === selectedFile && edge.target === file) ||
                (edge.target === selectedFile && edge.source === file),
            )
          )
          const isMuted = Boolean(
            selectedFile && !isSelected && !isRelated
          )

          return (
            <g
              key={file}
              className={`graph-node-group${
                isSelected ? ' graph-node-group-selected' : ''
              }${isRelated ? ' graph-node-group-related' : ''}${
                isMuted ? ' graph-node-group-muted' : ''
              }`}
              role="button"
              tabIndex="0"
              aria-label={shortName(file)}
              onClick={() => onSelectFile?.(file)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelectFile?.(file)
                }
              }}
            >
              <circle
                cx={point.x}
                cy={point.y}
                r="31"
                className="graph-node"
              />

              <text
                x={point.x}
                y={point.y + 4}
                textAnchor="middle"
                className="graph-node-label"
              >
                {shortName(file).slice(0, 12)}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="graph-legend">
        <span>
          <i className="legend-dot" />
          {t('sourceFile')}
        </span>
        <span>
          → {t('importDependency')}
        </span>
        <span>
          {t('maxNodes')}
        </span>
      </div>

      <div className="graph-interaction-hint">
        {t('graphHint')}
      </div>
    </div>
  )
}

function App() {
  const [language, setLanguage] = useState(
    () => localStorage.getItem('repolens-language') || 'en'
  )

  const [languageOpen, setLanguageOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [themePreference, setThemePreference] = useState(
    () => localStorage.getItem('repolens-theme') || 'system'
  )
  const [systemTheme, setSystemTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  })

  const t = (key, variables = {}) => {
    const localValue = INTERACTION_TEXT[language]?.[key]

    if (localValue) {
      return Object.entries(variables).reduce(
        (value, [name, replacement]) =>
          value.replaceAll(`{${name}}`, String(replacement)),
        localValue,
      )
    }

    return translate(language, key, variables)
  }

  const activeTheme =
    themePreference === 'system'
      ? systemTheme
      : themePreference

  useEffect(() => {
    document.documentElement.dataset.theme = activeTheme
  }, [activeTheme])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemTheme = (event) => {
      setSystemTheme(event.matches ? 'dark' : 'light')
    }

    setSystemTheme(media.matches ? 'dark' : 'light')
    media.addEventListener?.('change', updateSystemTheme)

    return () => {
      media.removeEventListener?.('change', updateSystemTheme)
    }
  }, [])

  const changeTheme = (nextTheme) => {
    setThemePreference(nextTheme)
    localStorage.setItem('repolens-theme', nextTheme)
    setThemeOpen(false)
  }

  const changeLanguage = (nextLanguage) => {
    setLanguage(nextLanguage)
    localStorage.setItem('repolens-language', nextLanguage)
    setLanguageOpen(false)
    setThemeOpen(false)
  }

  const [uploadFile, setUploadFile] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('overview')
  const [focusFile, setFocusFile] = useState('')
  const [analysisSource, setAnalysisSource] = useState(null)

  const sourceFiles = data?.source_files || []
  const pythonAnalysis = data?.python_analysis || {}
  const criticalFiles = data?.critical_files || []
  const circularDependencies = data?.circular_dependencies || []
  const impactAnalysis = data?.impact_analysis || {}

  const allEdges = useMemo(() => {
    const backendGraph = data?.dependency_graph || {}

    const backendEdges = Object.entries(
      backendGraph
    ).flatMap(([source, targets]) =>
      (targets || []).map((target) => ({
        key: `${source}->${target}`,
        source,
        target,
      }))
    )

    return backendEdges.length
      ? backendEdges
      : buildEdges(
          sourceFiles,
          pythonAnalysis
        )
  }, [data, sourceFiles, pythonAnalysis])

  const stats = useMemo(() => {
    let functions = 0
    let classes = 0
    let imports = 0

    Object.values(pythonAnalysis).forEach((info) => {
      functions += info.functions?.length || 0
      classes += info.classes?.length || 0
      imports += info.imports?.length || 0
    })

    return {
      functions,
      classes,
      imports,
    }
  }, [pythonAnalysis])

  const languages = useMemo(() => {
    const counts = {}

    for (const file of sourceFiles) {
      const ext = extension(file)
      if (!ext) continue

      const language = EXTENSIONS[ext] || ext.toUpperCase()
      counts[language] = (counts[language] || 0) + 1
    }

    return Object.entries(counts)
      .map(([name, count]) => ({
        name,
        count,
        percent: sourceFiles.length
          ? Math.round((count / sourceFiles.length) * 100)
          : 0,
      }))
      .sort((a, b) => b.count - a.count)
  }, [sourceFiles])

  const onboardingFiles = useMemo(() => {
    const entryNames = new Set([
      'main.py', 'app.py', 'server.py', 'manage.py',
      'index.js', 'index.jsx', 'index.ts', 'index.tsx',
      'main.js', 'main.jsx', 'main.ts', 'main.tsx',
    ])

    const isEntryFile = (file) =>
      entryNames.has(shortName(file).toLowerCase())

    const entryFiles = sourceFiles.filter(isEntryFile)
    const rankedFiles = criticalFiles.map((item) => item.file)
    const candidates = [...entryFiles, ...rankedFiles, ...sourceFiles]
    const seen = new Set()

    return candidates
      .filter((file) => {
        if (!file || seen.has(file)) return false
        seen.add(file)
        return true
      })
      .slice(0, 6)
      .map((file) => {
        const critical = criticalFiles.find((item) => item.file === file)
        const impact =
          impactAnalysis[file]?.impact_count ??
          critical?.total_impact ??
          0
        const dependencies = data?.dependency_graph?.[file]?.length || 0

        let reasonKey = 'onboardingExploreReason'
        if (isEntryFile(file)) reasonKey = 'onboardingEntryReason'
        else if ((critical?.score || 0) > 0) reasonKey = 'onboardingCriticalReason'
        else if (impact > 0) reasonKey = 'onboardingImpactReason'

        return {
          file,
          impact,
          dependencies,
          score: critical?.score || 0,
          reasonKey,
        }
      })
  }, [sourceFiles, criticalFiles, impactAnalysis, data])

  const activeFile =
    focusFile ||
    sourceFiles[0] ||
    ''

  const activeImpact =
    impactAnalysis[activeFile] || {}

  const impactedBy =
    activeImpact.affected_files ||
    allEdges
      .filter(
        (edge) => edge.target === activeFile
      )
      .map((edge) => edge.source)

  const risk =
    activeImpact.risk_level ||
    (
      impactedBy.length >= 5
        ? 'HIGH'
        : impactedBy.length >= 2
          ? 'MEDIUM'
          : 'LOW'
    )

  async function analyzeFile(file, source = 'upload') {
    if (!file) {
      setError(t('chooseZip'))
      return
    }

    setLoading(true)
    setAnalysisSource(source)
    setError('')

    const form = new FormData()
    form.append('file', file)

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: form,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          result.detail ||
          t('requestFailed'),
        )
      }

      setData(result)

      const firstFile =
        result.source_files?.[0] || ''

      setFocusFile(firstFile)
      setTab('overview')
    } catch (err) {
      setError(err.message || t('apiFailed'))
    } finally {
      setLoading(false)
      setAnalysisSource(null)
    }
  }

  async function analyzeRepository(event) {
    event.preventDefault()
    await analyzeFile(uploadFile, 'upload')
  }

  async function runDemo() {
    if (loading) return

    setLoading(true)
    setAnalysisSource('demo')
    setError('')

    try {
      const response = await fetch('/demo-repo.zip')

      if (!response.ok) {
        throw new Error(t('requestFailed'))
      }

      const blob = await response.blob()
      const demoFile = new File(
        [blob],
        'repolens-demo.zip',
        { type: 'application/zip' },
      )

      setUploadFile(demoFile)
      await analyzeFile(demoFile, 'demo')
    } catch (err) {
      setError(err.message || t('apiFailed'))
      setLoading(false)
      setAnalysisSource(null)
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark brand-logo">
  <img src="/cybertez-logo.png" alt="CYBERTEZ" />
</div>
          <div>
            <strong>CYBERTEZ</strong>
            <span>RepoLens</span>
          </div>
        </div>

        <div className="topbar-right">
          <div className="theme-selector">
            <button
              className="theme-button"
              type="button"
              aria-label={t('themeLabel')}
              title={t('themeLabel')}
              onClick={() => {
                setThemeOpen(!themeOpen)
                setLanguageOpen(false)
              }}
            >
              <span className="theme-icon">
                {activeTheme === 'dark' ? '☾' : '☀'}
              </span>
              <strong>
                {themePreference === 'system'
                  ? t('themeSystem')
                  : themePreference === 'dark'
                    ? t('themeDark')
                    : t('themeLight')}
              </strong>
              <span className="theme-chevron">▾</span>
            </button>

            {themeOpen && (
              <div className="theme-menu">
                {[
                  ['system', '◐', t('themeSystem')],
                  ['dark', '☾', t('themeDark')],
                  ['light', '☀', t('themeLight')],
                ].map(([value, icon, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={
                      themePreference === value
                        ? 'theme-active'
                        : ''
                    }
                    onClick={() => changeTheme(value)}
                  >
                    <span>{icon}</span>
                    <strong>{label}</strong>
                    {themePreference === value && <b>✓</b>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="language-selector">
            <button
              className="language-button"
              type="button"
              onClick={() => {
                setLanguageOpen(!languageOpen)
                setThemeOpen(false)
              }}
            >
              <span>{LANGUAGES[language].flag}</span>
              <strong>{LANGUAGES[language].short}</strong>
              <span className="language-chevron">▾</span>
            </button>

            {languageOpen && (
              <div className="language-menu">
                {Object.entries(LANGUAGES).map(([code, item]) => (
                  <button
                    key={code}
                    type="button"
                    className={language === code ? 'language-active' : ''}
                    onClick={() => changeLanguage(code)}
                  >
                    <span>{item.flag}</span>

                    <div>
                      <strong>{item.label}</strong>
                      <small>{item.short}</small>
                    </div>

                    {language === code && <b>✓</b>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="status-dot">
            <i />
            {t("analysisEngine")}
          </span>

          <a
            className="github-link"
            href="https://github.com/asadbekabduvahobovvvv-glitch/RepoLens"
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
        </div>
      </header>

      <main className="page">
        <section className="hero">
          <div>
            <div className="eyebrow">
              {t('codebaseIntelligence')}
            </div>

            <h1>
              {t('heroMain')}
              <span>{t('heroAccent')}</span>
            </h1>

            <p>
              {t('heroDescription')}
            </p>

            <div className="hero-tagline">
              <span>✦</span>
              <strong>{t('tagline')}</strong>
            </div>
          </div>

          <div className="hero-badge">
            <span>{t('securePipeline')}</span>
            <strong>{t('astDependency')}</strong>
            <small>
              {t('securePipelineText')}
            </small>
          </div>
        </section>

        <section className="upload-panel">
          <form
            className="upload-form"
            onSubmit={analyzeRepository}
          >
            <label className="dropzone">
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={(event) => {
                  setUploadFile(event.target.files?.[0] || null)
                  setError('')
                }}
              />

              <div className="upload-icon">↑</div>

              <div>
                <strong>
                  {uploadFile
                    ? uploadFile.name
                    : t('dropZip')}
                </strong>

                <span>
                  {uploadFile
                    ? t('selectedMb', {
                        size: (uploadFile.size / 1024 / 1024).toFixed(2),
                      })
                    : t('browseComputer')}
                </span>
              </div>
            </label>

            <button
              className="analyze-button"
              disabled={!uploadFile || loading}
              type="submit"
            >
              {loading
                ? t('analyzing')
                : t('analyzeRepository')}
            </button>

            <button
              className="demo-button"
              disabled={loading}
              type="button"
              onClick={runDemo}
            >
              {loading && analysisSource === 'demo'
                ? t('demoLoading')
                : t('tryDemo')}
            </button>
          </form>

          <div className="demo-hint">
            <span>✦</span>
            {t('demoHint')}
          </div>

          {error && (
            <div className="error-box">
              <strong>{t('analysisFailed')}</strong>
              <span>{error}</span>
            </div>
          )}
        </section>

        {!data ? (
          <section className="pre-analysis">
            <div className="pre-card">
              <span>01</span>
              <strong>{t('inspect')}</strong>
              <p>
                {t('inspectText')}
              </p>
            </div>

            <div className="pre-card">
              <span>02</span>
              <strong>{t('understand')}</strong>
              <p>
                {t('understandText')}
              </p>
            </div>

            <div className="pre-card">
              <span>03</span>
              <strong>{t('map')}</strong>
              <p>
                {t('mapText')}
              </p>
            </div>

            <div className="pre-card">
              <span>04</span>
              <strong>{t('predictImpact')}</strong>
              <p>
                {t('predictImpactText')}
              </p>
            </div>
          </section>
        ) : (
          <>
            <section className="result-header">
              <div>
                <span className="result-label">
                  {t('analysisComplete')}
                </span>

                <h2>
                  {data.filename?.replace(/\.zip$/i, '') ||
                    t('repository')}
                </h2>
              </div>

              <div className="result-health">
                <i />
                {t('parsedSuccessfully')}
              </div>
            </section>

            <section className="metrics">
              <MetricCard
                label={t('sourceFiles')}
                value={data.source_file_count ?? sourceFiles.length}
                detail={t('totalItems', { count: data.total_items ?? data.files?.length ?? 0 })}
              />

              <MetricCard
                label={t('functions')}
                value={stats.functions}
                detail={t('astDetected')}
              />

              <MetricCard
                label={t('classes')}
                value={stats.classes}
                detail={t('pythonStructures')}
              />

              <MetricCard
                label={t('dependencies')}
                value={allEdges.length}
                detail={t('importStatements', { count: stats.imports })}
              />
            </section>

            <nav className="tabs">
              {[
                ['overview', '◫', t('overview')],
                ['onboarding', '→', t('onboarding')],
                ['code', '</>', t('codeIntelligence')],
                ['impact', '⚡', t('impactAnalysis')],
              ].map(([id, icon, label]) => (
                <button
                  key={id}
                  type="button"
                  className={tab === id ? 'active' : ''}
                  onClick={() => setTab(id)}
                >
                  <span className="tab-icon">{icon}</span>
                  {label}
                </button>
              ))}
            </nav>

            {tab === 'overview' && (
              <section className="dashboard-grid">
                <div className="panel tree-panel">
                  <div className="panel-heading">
                    <div>
                      <span>{t('structure')}</span>
                      <h3>{t('repositoryTree')}</h3>
                    </div>

                    <small>
                      {t('items', { count: data.files?.length || 0 })}
                    </small>
                  </div>

                  <div className="tree-scroll">
                    <FileTree tree={data.tree} />
                  </div>
                </div>

                <div className="panel graph-panel">
                  <div className="panel-heading">
                    <div>
                      <span>{t('architecture')}</span>
                      <h3>{t('dependencyGraph')}</h3>
                    </div>

                    <small>
                      {t('relationships', { count: allEdges.length })}
                    </small>
                  </div>

                  <DependencyGraph
                    files={sourceFiles}
                    analysis={pythonAnalysis}
                    edges={allEdges}
                    selectedFile={focusFile}
                    onSelectFile={setFocusFile}
                    t={t}
                  />
                </div>

                <div className="panel language-panel">
                  <div className="panel-heading">
                    <div>
                      <span>{t('stack')}</span>
                      <h3>{t('languages')}</h3>
                    </div>
                  </div>

                  <div className="language-list">
                    {languages.length ? (
                      languages.map((language) => (
                        <div
                          className="language-row"
                          key={language.name}
                        >
                          <div>
                            <strong>{language.name}</strong>
                            <span>
                              {t('fileCount', { count: language.count })}
                            </span>
                          </div>

                          <div className="language-track">
                            <div
                              style={{
                                width: `${Math.max(language.percent, 5)}%`,
                              }}
                            />
                          </div>

                          <b>{language.percent}%</b>
                        </div>
                      ))
                    ) : (
                      <div className="empty-state">
                        {t('noLanguages')}
                      </div>
                    )}
                  </div>
                </div>

                <div className="panel security-panel">
                  <div className="panel-heading">
                    <div>
                      <span>{t('pipeline')}</span>
                      <h3>{t('securityPosture')}</h3>
                    </div>
                  </div>

                  <div className="security-list">
                    <div>
                      <i>✓</i>
                      <span>
                        <strong>{t('archiveValidation')}</strong>
                        {t('archiveValidationText')}
                      </span>
                    </div>

                    <div>
                      <i>✓</i>
                      <span>
                        <strong>{t('safeParsing')}</strong>
                        {t('safeParsingText')}
                      </span>
                    </div>

                    <div>
                      <i>✓</i>
                      <span>
                        <strong>{t('dependencyFiltering')}</strong>
                        {t('dependencyFilteringText')}
                      </span>
                    </div>

                    <div>
                      <i>✓</i>
                      <span>
                        <strong>{t('failureIsolation')}</strong>
                        {t('failureIsolationText')}
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {tab === 'code' && (
              <section className="code-layout">
                <div className="panel file-list-panel">
                  <div className="panel-heading">
                    <div>
                      <span>{t('source')}</span>
                      <h3>{t('analyzedFiles')}</h3>
                    </div>
                  </div>

                  <div className="source-list">
                    {sourceFiles.map((file) => (
                      <button
                        key={file}
                        type="button"
                        className={
                          activeFile === file
                            ? 'source-active'
                            : ''
                        }
                        onClick={() => setFocusFile(file)}
                      >
                        <span>{shortName(file)}</span>
                        <small>{file}</small>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="panel intelligence-panel">
                  <div className="panel-heading">
                    <div>
                      <span>{t('astIntelligence')}</span>
                      <h3>{shortName(activeFile)}</h3>
                    </div>

                    <small>
                      {pythonAnalysis[activeFile]?.parse_error
                        ? t('parseWarning')
                        : t('parsed')}
                    </small>
                  </div>

                  {pythonAnalysis[activeFile] ? (
                    <div className="intelligence-grid">
                      <div>
                        <span>{t('functions')}</span>
                        {(pythonAnalysis[activeFile].functions || [])
                          .length ? (
                          <ul>
                            {pythonAnalysis[
                              activeFile
                            ].functions.map((item) => (
                              <li key={item}>
                                ƒ {item}()
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>{t('noFunctions')}</p>
                        )}
                      </div>

                      <div>
                        <span>{t('classes')}</span>
                        {(pythonAnalysis[activeFile].classes || [])
                          .length ? (
                          <ul>
                            {pythonAnalysis[
                              activeFile
                            ].classes.map((item) => (
                              <li key={item}>
                                ◇ {item}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>{t('noClasses')}</p>
                        )}
                      </div>

                      <div className="imports-block">
                        <span>{t('imports')}</span>

                        {(pythonAnalysis[activeFile].imports || [])
                          .length ? (
                          <div className="tag-list">
                            {pythonAnalysis[
                              activeFile
                            ].imports.map((item) => (
                              <b key={item}>{item}</b>
                            ))}
                          </div>
                        ) : (
                          <p>{t('noImports')}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="empty-state">
                      {t('pythonOnly')}
                    </div>
                  )}
                </div>
              </section>
            )}

            {tab === 'onboarding' && (
              <section className="onboarding-layout">
                <div className="panel onboarding-intro">
                  <div className="onboarding-kicker">{t('onboardingEyebrow')}</div>
                  <h3>{t('onboardingTitle')}</h3>
                  <p>{t('onboardingDescription')}</p>

                  <div className="onboarding-stats">
                    <div>
                      <strong>{onboardingFiles.length}</strong>
                      <span>{t('onboardingSuggestedFiles')}</span>
                    </div>
                    <div>
                      <strong>{criticalFiles.filter((item) => item.score > 0).length}</strong>
                      <span>{t('onboardingCriticalCount')}</span>
                    </div>
                    <div>
                      <strong>{circularDependencies.length}</strong>
                      <span>{t('onboardingCycleCount')}</span>
                    </div>
                  </div>
                </div>

                <div className="panel onboarding-list-panel">
                  <div className="panel-heading">
                    <div>
                      <span>{t('onboardingReadOrder')}</span>
                      <h3>{t('onboardingReadOrderTitle')}</h3>
                    </div>
                  </div>

                  <div className="onboarding-steps">
                    {onboardingFiles.map((item, index) => (
                      <div className="onboarding-step" key={item.file}>
                        <div className="onboarding-step-number">
                          {String(index + 1).padStart(2, '0')}
                        </div>

                        <div className="onboarding-step-copy">
                          <div>
                            <strong>{shortName(item.file)}</strong>
                            <small>{item.file}</small>
                          </div>
                          <p>
                            {t(item.reasonKey, {
                              impact: item.impact,
                              deps: item.dependencies,
                            })}
                          </p>
                        </div>

                        <div className="onboarding-step-meta">
                          <span>{t('onboardingImpactBadge', { count: item.impact })}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setFocusFile(item.file)
                              setTab('code')
                            }}
                          >
                            {t('inspectFile')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="panel onboarding-path-panel">
                  <div className="panel-heading">
                    <div>
                      <span>{t('onboardingPath')}</span>
                      <h3>{t('onboardingPathTitle')}</h3>
                    </div>
                  </div>

                  <div className="onboarding-path">
                    {onboardingFiles.slice(0, 4).map((item, index) => (
                      <div className="onboarding-path-item" key={item.file}>
                        <span>{shortName(item.file)}</span>
                        {index < Math.min(onboardingFiles.length, 4) - 1 && <b>→</b>}
                      </div>
                    ))}
                  </div>

                  <p>{t('onboardingPathText')}</p>
                </div>
              </section>
            )}

            {tab === 'impact' && (
              <section className="impact-layout">
                <div className="panel impact-selector">
                  <div className="panel-heading">
                    <div>
                      <span>{t('changeSimulation')}</span>
                      <h3>{t('selectSourceFile')}</h3>
                    </div>
                  </div>

                  <select
                    value={activeFile}
                    onChange={(event) =>
                      setFocusFile(event.target.value)
                    }
                  >
                    {sourceFiles.map((file) => (
                      <option
                        value={file}
                        key={file}
                      >
                        {file}
                      </option>
                    ))}
                  </select>

                  <div className={`risk-box risk-${risk.toLowerCase()}`}>
                    <span>{t('changeRisk')}</span>
                    <strong>{t(`risk${risk}`)}</strong>
                    <small>
                      {t('blastCount', { count: impactedBy.length })}
                    </small>
                  </div>

                  <div className="critical-mini">
                    <span className="advanced-label">
                      {t('criticalFiles')}
                    </span>

                    <strong>
                      {t('influentialModules')}
                    </strong>

                    {criticalFiles
                      .slice(0, 3)
                      .map((item, index) => (
                        <div
                          className="critical-file-row"
                          key={item.file}
                        >
                          <b>#{index + 1}</b>

                          <div>
                            <strong>
                              {shortName(item.file)}
                            </strong>
                            <small>
                              {t('impactDirect', {
                                impact: item.total_impact,
                                direct: item.direct_dependents,
                              })}
                            </small>
                          </div>

                          <span>
                            {item.score}
                          </span>
                        </div>
                      ))}
                  </div>

                  <div
                    className={
                      circularDependencies.length
                        ? 'architecture-warning architecture-danger'
                        : 'architecture-warning architecture-safe'
                    }
                  >
                    <span>
                      {circularDependencies.length
                        ? '⚠'
                        : '✓'}
                    </span>

                    <div>
                      <strong>
                        {t('architectureCheck')}
                      </strong>

                      <small>
                        {circularDependencies.length
                          ? t('circularFound', { count: circularDependencies.length })
                          : t('noCircular')}
                      </small>
                    </div>
                  </div>
                </div>

                <div className="panel impact-report">
                  <div className="panel-heading">
                    <div>
                      <span>{t('blastRadius')}</span>
                      <h3>
                        {t('ifChanges', { file: shortName(activeFile) })}
                      </h3>
                    </div>
                  </div>

                  {impactedBy.length ? (
                    <div className="impact-files">
                      {impactedBy.map((file) => (
                        <div key={file}>
                          <span>→</span>
                          <div>
                            <strong>{shortName(file)}</strong>
                            <small>{file}</small>
                          </div>
                          <b>{t('affected')}</b>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      {t('noDependents')}
                    </div>
                  )}

                  <div className="impact-note">
                    <strong>{t('howEstimated')}</strong>
                    <p>
                      {t('howEstimatedText')}
                    </p>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <footer className="site-footer">
        <div className="footer-brand">
          <span>RepoLens</span>
          <p>{t('footerText')}</p>
        </div>

        <div className="footer-motto">
          <small>✦</small>
          <strong>{t('tagline')}</strong>
        </div>

        <div className="footer-links">
          <a
            href="https://github.com/asadbekabduvahobovvvv-glitch/RepoLens"
            target="_blank"
            rel="noreferrer"
          >
            {t('repositoryLink')} ↗
          </a>
          <a
            href="https://github.com/asadbekabduvahobovvvv-glitch"
            target="_blank"
            rel="noreferrer"
          >
            {t('contact')} ↗
          </a>
          <b>FastAPI · React · AST · Docker</b>
        </div>
      </footer>
    </div>
  )
}

export default App
