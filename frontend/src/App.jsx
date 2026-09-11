import { useMemo, useState } from 'react'
import './App.css'

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

function DependencyGraph({ files, analysis }) {
  const nodes = (files || []).slice(0, 10)
  const allEdges = buildEdges(files, analysis)
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
        Upload a repository to generate an architecture map.
      </div>
    )
  }

  return (
    <div className="graph-shell">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="graph-svg"
        role="img"
        aria-label="Repository dependency graph"
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
              className="graph-edge"
              markerEnd="url(#arrow)"
            />
          )
        })}

        {nodes.map((file) => {
          const point = positions[file]

          return (
            <g key={file}>
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
          Source file
        </span>
        <span>
          → import dependency
        </span>
        <span>
          Showing max 10 nodes
        </span>
      </div>
    </div>
  )
}

function App() {
  const [uploadFile, setUploadFile] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('overview')
  const [focusFile, setFocusFile] = useState('')

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

  async function analyzeRepository(event) {
    event.preventDefault()

    if (!uploadFile) {
      setError('Choose a ZIP repository first.')
      return
    }

    setLoading(true)
    setError('')

    const form = new FormData()
    form.append('file', uploadFile)

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: form,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          result.detail ||
          'Repository analysis failed.',
        )
      }

      setData(result)

      const firstFile =
        result.source_files?.[0] || ''

      setFocusFile(firstFile)
      setTab('overview')
    } catch (err) {
      setError(err.message || 'Unable to reach RepoLens API.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">R</div>
          <div>
            <strong>RepoLens</strong>
            <span>Repository Intelligence</span>
          </div>
        </div>

        <div className="topbar-right">
          <span className="status-dot">
            <i />
            Analysis engine
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
              CODEBASE INTELLIGENCE
            </div>

            <h1>
              Understand a repository
              <span> before you touch it.</span>
            </h1>

            <p>
              RepoLens turns unfamiliar source code into a visual
              architecture map, dependency model and change-impact report.
            </p>
          </div>

          <div className="hero-badge">
            <span>SECURE PIPELINE</span>
            <strong>AST + dependency intelligence</strong>
            <small>
              Untrusted ZIP inspection · resource limits · safe parsing
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
                    : 'Drop a repository ZIP here'}
                </strong>

                <span>
                  {uploadFile
                    ? `${(uploadFile.size / 1024 / 1024).toFixed(2)} MB selected`
                    : 'or click to browse from your computer'}
                </span>
              </div>
            </label>

            <button
              className="analyze-button"
              disabled={!uploadFile || loading}
              type="submit"
            >
              {loading
                ? 'Analyzing…'
                : 'Analyze repository'}
            </button>
          </form>

          {error && (
            <div className="error-box">
              <strong>Analysis failed</strong>
              <span>{error}</span>
            </div>
          )}
        </section>

        {!data ? (
          <section className="pre-analysis">
            <div className="pre-card">
              <span>01</span>
              <strong>Inspect</strong>
              <p>
                Validate the archive and safely inspect repository metadata.
              </p>
            </div>

            <div className="pre-card">
              <span>02</span>
              <strong>Understand</strong>
              <p>
                Parse Python AST, functions, classes and imports.
              </p>
            </div>

            <div className="pre-card">
              <span>03</span>
              <strong>Map</strong>
              <p>
                Visualize dependency relationships across source files.
              </p>
            </div>

            <div className="pre-card">
              <span>04</span>
              <strong>Predict impact</strong>
              <p>
                Estimate what may be affected before changing a file.
              </p>
            </div>
          </section>
        ) : (
          <>
            <section className="result-header">
              <div>
                <span className="result-label">
                  ANALYSIS COMPLETE
                </span>

                <h2>
                  {data.filename?.replace(/\.zip$/i, '') ||
                    'Repository'}
                </h2>
              </div>

              <div className="result-health">
                <i />
                Repository parsed successfully
              </div>
            </section>

            <section className="metrics">
              <MetricCard
                label="Source files"
                value={data.source_file_count ?? sourceFiles.length}
                detail={`${data.total_items ?? data.files?.length ?? 0} total archive items`}
              />

              <MetricCard
                label="Functions"
                value={stats.functions}
                detail="Detected through AST"
              />

              <MetricCard
                label="Classes"
                value={stats.classes}
                detail="Python structures"
              />

              <MetricCard
                label="Dependencies"
                value={allEdges.length}
                detail={`${stats.imports} import statements`}
              />
            </section>

            <nav className="tabs">
              {[
                ['overview', 'Overview'],
                ['code', 'Code intelligence'],
                ['impact', 'Impact analysis'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={tab === id ? 'active' : ''}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>

            {tab === 'overview' && (
              <section className="dashboard-grid">
                <div className="panel tree-panel">
                  <div className="panel-heading">
                    <div>
                      <span>STRUCTURE</span>
                      <h3>Repository tree</h3>
                    </div>

                    <small>
                      {data.files?.length || 0} items
                    </small>
                  </div>

                  <div className="tree-scroll">
                    <FileTree tree={data.tree} />
                  </div>
                </div>

                <div className="panel graph-panel">
                  <div className="panel-heading">
                    <div>
                      <span>ARCHITECTURE</span>
                      <h3>Dependency graph</h3>
                    </div>

                    <small>
                      {allEdges.length} relationships
                    </small>
                  </div>

                  <DependencyGraph
                    files={sourceFiles}
                    analysis={pythonAnalysis}
                  />
                </div>

                <div className="panel language-panel">
                  <div className="panel-heading">
                    <div>
                      <span>STACK</span>
                      <h3>Languages</h3>
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
                              {language.count} file
                              {language.count !== 1 ? 's' : ''}
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
                        No source languages detected.
                      </div>
                    )}
                  </div>
                </div>

                <div className="panel security-panel">
                  <div className="panel-heading">
                    <div>
                      <span>PIPELINE</span>
                      <h3>Security posture</h3>
                    </div>
                  </div>

                  <div className="security-list">
                    <div>
                      <i>✓</i>
                      <span>
                        <strong>Archive validation</strong>
                        ZIP input validated before analysis
                      </span>
                    </div>

                    <div>
                      <i>✓</i>
                      <span>
                        <strong>Safe source parsing</strong>
                        AST parsing without executing repository code
                      </span>
                    </div>

                    <div>
                      <i>✓</i>
                      <span>
                        <strong>Dependency filtering</strong>
                        Vendor and cache directories excluded
                      </span>
                    </div>

                    <div>
                      <i>✓</i>
                      <span>
                        <strong>Failure isolation</strong>
                        Malformed Python files do not crash analysis
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
                      <span>SOURCE</span>
                      <h3>Analyzed files</h3>
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
                      <span>AST INTELLIGENCE</span>
                      <h3>{shortName(activeFile)}</h3>
                    </div>

                    <small>
                      {pythonAnalysis[activeFile]?.parse_error
                        ? 'Parse warning'
                        : 'Parsed'}
                    </small>
                  </div>

                  {pythonAnalysis[activeFile] ? (
                    <div className="intelligence-grid">
                      <div>
                        <span>Functions</span>
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
                          <p>No functions detected.</p>
                        )}
                      </div>

                      <div>
                        <span>Classes</span>
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
                          <p>No classes detected.</p>
                        )}
                      </div>

                      <div className="imports-block">
                        <span>Imports</span>

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
                          <p>No imports detected.</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="empty-state">
                      Detailed AST analysis is currently available
                      for Python source files.
                    </div>
                  )}
                </div>
              </section>
            )}

            {tab === 'impact' && (
              <section className="impact-layout">
                <div className="panel impact-selector">
                  <div className="panel-heading">
                    <div>
                      <span>CHANGE SIMULATION</span>
                      <h3>Select a source file</h3>
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
                    <span>Change risk</span>
                    <strong>{risk}</strong>
                    <small>
                      {impactedBy.length} file
                      {impactedBy.length !== 1 ? 's' : ''} in full blast radius
                    </small>
                  </div>

                  <div className="critical-mini">
                    <span className="advanced-label">
                      CRITICAL FILES
                    </span>

                    <strong>
                      Most influential modules
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
                              Impact: {item.total_impact}
                              {' · '}
                              Direct: {item.direct_dependents}
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
                        Architecture check
                      </strong>

                      <small>
                        {circularDependencies.length
                          ? `${circularDependencies.length} circular dependency path(s) detected`
                          : 'No circular dependencies detected'}
                      </small>
                    </div>
                  </div>
                </div>

                <div className="panel impact-report">
                  <div className="panel-heading">
                    <div>
                      <span>BLAST RADIUS</span>
                      <h3>
                        If {shortName(activeFile)} changes…
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
                          <b>AFFECTED</b>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      No direct incoming dependency was detected for
                      this file. Its current blast radius appears low.
                    </div>
                  )}

                  <div className="impact-note">
                    <strong>How RepoLens estimates this</strong>
                    <p>
                      RepoLens traces import relationships and follows
                      reverse dependencies transitively. This means the
                      blast radius can include files several dependency
                      levels away, not only direct imports. Future versions
                      can extend this with function-level call graphs and
                      git-diff analysis.
                    </p>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <footer>
        <span>RepoLens</span>
        <p>
          Built to make unfamiliar codebases easier and safer to change.
        </p>
        <b>FastAPI · React · AST · Docker</b>
      </footer>
    </div>
  )
}

export default App
