import React, { useRef, useState, useCallback, useEffect } from 'react'
import Canvas from './components/Canvas.jsx'

const DEFAULT_EXPR = 'sin(a*x + b)*c'
const RANDOM_FUNCS = [
  'sin(a*x + b)*c',
  'cos(a*x + b)*c',
  'sin(a*x) + cos(b*x)',
  'sin(a*x) * cos(b*x) * c',
  'sin(a*x*x + b) * c',
  'tan(a*x + b)*c', // added
]

export default function App() {
  const [expr, setExpr] = useState(DEFAULT_EXPR)
  const [params, setParams] = useState({ a: 1, b: 0, c: 1 })
  const [lineColor, setLineColor] = useState('#111827')
  // add a separate color for the bucket tool so it doesn't affect line drawing
  const [bucketColor, setBucketColor] = useState('#111827')
  const [bgColor] = useState('#ffffff')
  const [tilt, setTilt] = useState(0)
  const [lineWidth, setLineWidth] = useState(2)
  const [lineOpacity, setLineOpacity] = useState(1)
  const [activeTool, setActiveTool] = useState('line')
  const [showLineMenu, setShowLineMenu] = useState(false)
  const [showParamMenu, setShowParamMenu] = useState(false)
  // add bucket popover state
  const [showBucketMenu, setShowBucketMenu] = useState(false)
  const isAnyMenuOpen = showLineMenu || showParamMenu || showBucketMenu
  const canvasRef = useRef(null)
  const containerRef = useRef(null) // wrapper that contains the canvas
  const [bucketCursorUrl, setBucketCursorUrl] = useState(() => {
    try { return localStorage.getItem('fxart:bucketCursorUrl') } catch { return null }
  })
  const [toolbarReady, setToolbarReady] = useState(!!bucketCursorUrl)
  const [isMagicRunning, setIsMagicRunning] = useState(false)
  // measure bucket cursor image to place hotspot at bottom-right
  const [bucketCursorSize, setBucketCursorSize] = useState({ w: 0, h: 0 })
  const [isLandscape, setIsLandscape] = useState(false)

  // New: bucket controls
  const [bucketTolerance, setBucketTolerance] = useState(24) // similarity to seed (sum abs RGBA)
  const [gapCloseRadius, setGapCloseRadius] = useState(1)    // barrier dilation in px

  const updateParam = useCallback((key, value) => {
    setParams(p => ({ ...p, [key]: value }))
  }, [])

  const handleReset = useCallback(() => {
    canvasRef.current?.reset()
  }, [])

  const handleSave = useCallback(() => {
    canvasRef.current?.save()
  }, [])

  const handleFreeze = useCallback(() => {
    canvasRef.current?.freeze()
  }, [])

  const handleRandom = useCallback(() => {
    const next = RANDOM_FUNCS[Math.floor(Math.random() * RANDOM_FUNCS.length)]
    setExpr(next)
  }, [])

  // Sync a CSS variable to the device's visual viewport height to avoid
  // bottom address bar gaps on mobile browsers.
  useEffect(() => {
    const root = document.documentElement
    const setVh = () => {
      const vh = (window.visualViewport?.height ?? window.innerHeight)
      root.style.setProperty('--app-vh', vh + 'px')
    }
    setVh()
    window.addEventListener('resize', setVh)
    window.visualViewport?.addEventListener('resize', setVh)
    window.addEventListener('orientationchange', setVh)
    return () => {
      window.removeEventListener('resize', setVh)
      window.visualViewport?.removeEventListener('resize', setVh)
      window.removeEventListener('orientationchange', setVh)
    }
  }, [])

  // Helper: hex string -> [r,g,b,a]
  const hexToRgba = useCallback((hex) => {
    let h = hex.replace('#', '')
    if (h.length === 3) h = h.split('').map(c => c + c).join('')
    const num = parseInt(h, 16)
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255, 255]
  }, [])

  // Edge-aware Flood fill (non-recursive) on 2D canvas context
  // - Builds a barrier mask from non-background pixels
  // - Dilates the mask gapClose px to seal pinholes
  // - Carves out pixels similar to the seed color so recoloring works
  // - Grows fill only through non-barrier pixels similar to the seed color
  const floodFill = useCallback((canvasEl, x, y, fillRgba, tolerance = 24, gapClose = 1, bgHex = '#ffffff') => {
    const ctx = canvasEl.getContext('2d')
    if (!ctx) return
    const { width, height } = canvasEl
    const img = ctx.getImageData(0, 0, width, height)
    const data = img.data

    const idx = (xx, yy) => (yy * width + xx) * 4
    const start = idx(x, y)
    const target = [data[start], data[start + 1], data[start + 2], data[start + 3]]

    const sameColor = (o, n) => o[0] === n[0] && o[1] === n[1] && o[2] === n[2] && o[3] === n[3]
    if (sameColor(target, fillRgba)) return

    // Build barrier mask from non-background pixels (vs bg color)
    const bg = hexToRgba(bgHex)
    const barrier = new Uint8Array(width * height)
    const barrierThreshold = 40 // sum(abs(rgb - bg)) above this is considered an edge/line

    for (let p = 0, i = 0; i < data.length; i += 4, p++) {
      const dr = data[i] - bg[0]
      const dg = data[i + 1] - bg[1]
      const db = data[i + 2] - bg[2]
      const dist = Math.abs(dr) + Math.abs(dg) + Math.abs(db)
      if (dist > barrierThreshold) barrier[p] = 1
    }

    // Dilate barrier mask by 'gapClose' pixels to seal microscopic gaps
    if (gapClose > 0) {
      let cur = barrier
      for (let iter = 0; iter < gapClose; iter++) {
        const next = new Uint8Array(width * height)
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const p = y * width + x
            if (cur[p]) { next[p] = 1; continue }
            let found = false
            for (let dy = -1; dy <= 1 && !found; dy++) {
              const yy = y + dy
              if (yy < 0 || yy >= height) continue
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue
                const xx = x + dx
                if (xx < 0 || xx >= width) continue
                if (cur[yy * width + xx]) { found = true; break }
              }
            }
            if (found) next[p] = 1
          }
        }
        cur = next
      }
      barrier.set(cur)
    }

    // New: carve out pixels similar to the seed color so bucket can recolor existing regions
    {
      const carveTol = Math.max(tolerance, 24)
      for (let p = 0, i = 0; i < data.length; i += 4, p++) {
        const dr = data[i] - target[0]
        const dg = data[i + 1] - target[1]
        const db = data[i + 2] - target[2]
        const da = data[i + 3] - target[3]
        const sum = Math.abs(dr) + Math.abs(dg) + Math.abs(db) + Math.abs(da)
        if (sum <= carveTol) barrier[p] = 0
      }
    }

    // If the seed starts on a barrier pixel, abort (after carve-out)
    if (barrier[(start >> 2)] === 1) return

    const closeEnough = (i) => {
      const p = i >> 2
      if (barrier[p]) return false
      const dr = data[i] - target[0]
      const dg = data[i + 1] - target[1]
      const db = data[i + 2] - target[2]
      const da = data[i + 3] - target[3]
      return (Math.abs(dr) + Math.abs(dg) + Math.abs(db) + Math.abs(da)) <= tolerance
    }

    const stack = [[x, y]]
    while (stack.length) {
      const [cx, cy] = stack.pop()
      let lx = cx
      // move left within non-barrier and similarity tolerance
      while (lx >= 0 && closeEnough(idx(lx, cy))) lx--
      lx++
      let rx = cx
      // move right within non-barrier and similarity tolerance
      while (rx < width && closeEnough(idx(rx, cy))) rx++

      // fill the span
      for (let xx = lx; xx < rx; xx++) {
        const di = idx(xx, cy)
        data[di] = fillRgba[0]
        data[di + 1] = fillRgba[1]
        data[di + 2] = fillRgba[2]
        data[di + 3] = fillRgba[3]

        // check up
        if (cy > 0 && closeEnough(idx(xx, cy - 1))) stack.push([xx, cy - 1])
        // check down
        if (cy < height - 1 && closeEnough(idx(xx, cy + 1))) stack.push([xx, cy + 1])
      }
    }

    ctx.putImageData(img, 0, 0)
  }, [hexToRgba])

  // Handle user click when Bucket tool is active
  const handleBucketClick = useCallback((e) => {
    if (activeTool !== 'bucket') return
    const container = containerRef.current
    if (!container) return
    const canvasEl = container.querySelector('canvas')
    if (!canvasEl) return

    const rect = canvasEl.getBoundingClientRect()
    const scaleX = (canvasEl.width || rect.width) / rect.width
    const scaleY = (canvasEl.height || rect.height) / rect.height

    const clientX = e.clientX
    const clientY = e.clientY
    const x = Math.floor((clientX - rect.left) * scaleX)
    const y = Math.floor((clientY - rect.top) * scaleY)

    const fillRgba = hexToRgba(bucketColor)
    floodFill(canvasEl, x, y, fillRgba, bucketTolerance, gapCloseRadius, bgColor)
    e.stopPropagation()
    e.preventDefault()
  }, [activeTool, hexToRgba, floodFill, bucketColor, bucketTolerance, gapCloseRadius, bgColor])

  // Magic: fill 10 random points using flood fill (edge-aware, with current settings)
  const handleMagic = useCallback(async () => {
    const container = containerRef.current
    const canvasEl = container?.querySelector('canvas')
    if (!canvasEl) return

    const rect = canvasEl.getBoundingClientRect()
    const cw = canvasEl.width || rect.width
    const ch = canvasEl.height || rect.height
    const N = 10

    setIsMagicRunning(true)
    setActiveTool('bucket') // keep bucket tool UI/cursor

    const raf = () => new Promise(requestAnimationFrame)
    try {
      for (let i = 0; i < N; i++) {
        const px = Math.floor(Math.random() * cw)
        const py = Math.floor(Math.random() * ch)
        const color = `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`
        const fillRgba = hexToRgba(color)
        floodFill(canvasEl, px, py, fillRgba, bucketTolerance, gapCloseRadius, bgColor)
        if (i % 8 === 0) await raf()
      }
    } finally {
      setIsMagicRunning(false)
    }
  }, [hexToRgba, floodFill, bucketTolerance, gapCloseRadius, bgColor])

  // Capture the bucket cursor URL once (on mount), then persist it. Hide toolbar until captured to prevent icon flicker.
  useEffect(() => {
    if (bucketCursorUrl) { setToolbarReady(true); return }
    const el = document.querySelector('canvas')
    if (!el) { setToolbarReady(true); return }
    const originalTool = activeTool
    const readCursor = () => {
      const cur = getComputedStyle(el).cursor || ''
      const m = cur.match(/url\(["']?([^"')]+)["']?\)/)
      if (m && m[1]) {
        setBucketCursorUrl(m[1])
        try { localStorage.setItem('fxart:bucketCursorUrl', m[1]) } catch {}
      }
      setToolbarReady(true)
    }
    // Temporarily switch to bucket to let Canvas apply its cursor, then switch back.
    setActiveTool('bucket')
    requestAnimationFrame(() => {
      readCursor()
      setActiveTool(originalTool)
    })
  }, []) // run once

  // Still update if cursor URL changes later (e.g., theme swap), and persist.
  useEffect(() => {
    const el = document.querySelector('canvas')
    if (!el) return
    const cur = getComputedStyle(el).cursor || ''
    const m = cur.match(/url\(["']?([^"')]+)["']?\)/)
    if (m && m[1] && m[1] !== bucketCursorUrl) {
      setBucketCursorUrl(m[1])
      try { localStorage.setItem('fxart:bucketCursorUrl', m[1]) } catch {}
    }
  }, [activeTool])

  // Load bucket cursor image to determine hotspot (bottom-right)
  useEffect(() => {
    if (!bucketCursorUrl) { setBucketCursorSize({ w: 0, h: 0 }); return }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => setBucketCursorSize({ w: img.width, h: img.height })
    img.onerror = () => setBucketCursorSize({ w: 0, h: 0 })
    img.src = bucketCursorUrl
  }, [bucketCursorUrl])

  // Track orientation to switch layouts (portrait: top bar with two rows; landscape: sidebar with two columns)
  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)')
    const set = () => setIsLandscape(!!mq.matches)
    set()
    mq.addEventListener?.('change', set)
    window.addEventListener('orientationchange', set)
    return () => {
      try { mq.removeEventListener?.('change', set) } catch {}
      window.removeEventListener('orientationchange', set)
    }
  }, [])

  const inputWidthClass = isLandscape ? 'w-40' : 'w-36 sm:w-56 md:w-64'

  const ToolbarInner = (
    <>
                {/* Line menu (icon only + color sample) */}
                <div className="relative">
                  <button
                    onClick={() => { setActiveTool('line'); setShowBucketMenu(false); setShowLineMenu(v => !v); }}
                    aria-label="Line settings"
                    className={`relative w-9 h-9 rounded-md text-sm flex items-center justify-center border ${activeTool === 'line' ? 'border-indigo-500 text-indigo-700 bg-indigo-50' : 'border-gray-200 text-gray-800 hover:bg-gray-50'}`}
                    title="Line settings"
                  >
                    {/* line preview */}
                    <span
                      className="block"
                      style={{ backgroundColor: lineColor, opacity: lineOpacity, height: 2, width: 20 }}
                    />
                    {/* color sample dot */}
                    <span
                      className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border border-white shadow"
                      style={{ backgroundColor: lineColor, opacity: lineOpacity }}
                    />
                  </button>
                  {showLineMenu && (
                    <div
                      className={`absolute ${isLandscape ? 'right-full mr-2 top-0' : 'mt-2 left-0'} w-64 bg-white border border-gray-200 rounded-lg shadow p-3 z-50`}
                      style={{ maxHeight: 'calc(var(--app-vh) - 16px)', overflowY: 'auto' }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm text-gray-600">Color</label>
                        <input
                          type="color"
                          value={lineColor}
                          onChange={e => setLineColor(e.target.value)}
                          className="w-8 h-8 p-0 border-none bg-transparent"
                        />
                      </div>
                      <div className="mb-3">
                        <label className="block text-sm text-gray-600 mb-1">
                          Thickness: {lineWidth}px
                        </label>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          value={lineWidth}
                          onChange={e => setLineWidth(Number(e.target.value))}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">
                          Opacity: {lineOpacity.toFixed(2)}
                        </label>
                        <input
                          type="range"
                          min={0.05}
                          max={1}
                          step={0.05}
                          value={lineOpacity}
                          onChange={e => setLineOpacity(Number(e.target.value))}
                          className="w-full"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Bucket tool with color popover (uses its own color; independent from line color) */}
                <div className="relative">
                  <button
                    onClick={() => { setActiveTool('bucket'); setShowLineMenu(false); setShowBucketMenu(v => !v); }}
                    aria-label="Bucket fill tool"
                    className={`relative w-9 h-9 rounded-md text-sm flex items-center justify-center border ${activeTool === 'bucket' ? 'border-indigo-500 text-indigo-700 bg-indigo-50' : 'border-gray-200 text-gray-800 hover:bg-gray-50'}`}
                    title="Bucket fill tool"
                  >
                    {bucketCursorUrl ? (
                      <span
                        className="w-5 h-5 bg-no-repeat bg-contain"
                        style={{ backgroundImage: `url("${bucketCursorUrl}")` }}
                      />
                    ) : (
                      // fallback only if we failed to capture a cursor URL
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="text-gray-700">
                        <path d="M3 11l7-7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                        <path d="M6 10l1 9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                        <path d="M17.5 14.5c1 1 .5 2.5-1 3-1.5-.5-2-2-1-3 .5-.5 1.5-.5 2 0z" fill="currentColor"/>
                      </svg>
                    )}
                    {/* color sample dot shows bucketColor (no opacity coupling) */}
                    <span
                      className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border border-white shadow"
                      style={{ backgroundColor: bucketColor }}
                    />
                  </button>
                  {showBucketMenu && (
                    <div
                      className={`absolute ${isLandscape ? 'right-full mr-2 top-0' : 'mt-2 left-0'} w-64 bg-white border border-gray-200 rounded-lg shadow p-3 z-50`}
                      style={{ maxHeight: 'calc(var(--app-vh) - 16px)', overflowY: 'auto' }}
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-gray-600">Color</label>
                        <input
                          type="color"
                          value={bucketColor}
                          onChange={e => setBucketColor(e.target.value)}
                          className="w-8 h-8 p-0 border-none bg-transparent"
                        />
                      </div>

                      {/* New: Tolerance slider */}
                      <div className="mt-3">
                        <label className="block text-sm text-gray-600 mb-1">
                          Tolerance: {bucketTolerance}
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={200}
                          step={1}
                          value={bucketTolerance}
                          onChange={e => setBucketTolerance(Number(e.target.value))}
                          className="w-full"
                        />
                      </div>

                      {/* New: Gap closing slider */}
                      <div className="mt-3">
                        <label className="block text-sm text-gray-600 mb-1">
                          Close gaps (px): {gapCloseRadius}
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={3}
                          step={1}
                          value={gapCloseRadius}
                          onChange={e => setGapCloseRadius(Number(e.target.value))}
                          className="w-full"
                        />
                      </div>

                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <button
                          onClick={handleMagic}
                          className="w-full px-3 py-1.5 rounded-md text-sm border border-purple-300 text-purple-700 hover:bg-purple-50"
                          title="Auto-fill 10 random points with random colors"
                        >
                          Magic
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* f(x) input - narrowed to keep menu compact */}
                <div className="flex-none">
                  <input
                    value={expr}
                    onChange={e => setExpr(e.target.value)}
                    placeholder="f(x) ="
                    className={`${inputWidthClass} px-3 py-1.5 rounded-md border border-gray-200 text-sm`}
                  />
                </div>

                {/* Random function */}
                <button
                  onClick={handleRandom}
                  className="px-3 py-1.5 rounded-md text-sm border border-gray-200 text-gray-800 hover:bg-gray-50"
                  title="Random function"
                >
                  Rnd
                </button>

                {/* Parameters popover (a, b, c) */}
                <div className="relative">
                  <button
                    onClick={() => setShowParamMenu(v => !v)}
                    className="px-3 py-1.5 rounded-md text-sm border border-gray-200 text-gray-800 hover:bg-gray-50"
                    title="Adjust parameters"
                  >
                    abc
                  </button>
                  {showParamMenu && (
                    <div
                      className={`absolute ${isLandscape ? 'right-full mr-2 top-0' : 'mt-2 right-0'} w-72 bg-white border border-gray-200 rounded-lg shadow p-3 z-50`}
                      style={{ maxHeight: 'calc(var(--app-vh) - 16px)', overflowY: 'auto' }}
                    >
                      {['a','b','c'].map(k => (
                        <div className="mb-3" key={k}>
                          <div className="flex justify-between text-sm text-gray-600 mb-1">
                            <label>{k}</label>
                            <span>{params[k]}</span>
                          </div>
                          <input
                            type="range"
                            min={k === 'c' ? 0 : -10}
                            max={10}
                            step={0.1}
                            value={params[k]}
                            onChange={e => updateParam(k, Number(e.target.value))}
                            className="w-full"
                          />
                        </div>
                      ))}
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setParams({ a: 1, b: 0, c: 1 })}
                          className="px-2 py-1 rounded-md text-sm border border-gray-200 text-gray-700 hover:bg-gray-50"
                        >
                          Reset
                        </button>
                        <button
                          onClick={() => setShowParamMenu(false)}
                          className="px-2 py-1 rounded-md text-sm text-white"
                          style={{ backgroundColor: '#4f46e5' }}
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Tilt */}
                <button
                  onClick={() => setTilt(t => (t + 10) % 360)}
                  className="px-3 py-1.5 rounded-md text-sm border border-gray-200 text-gray-800 hover:bg-gray-50"
                  title={`Tilt (${Math.round(tilt)}°)`}
                >
                  Tilt
                </button>

                {/* Save (freeze) */}
                <button
                  onClick={handleFreeze}
                  className="px-3 py-1.5 rounded-md text-sm text-white"
                  style={{ backgroundColor: '#059669' }}
                  title="Save (freeze)"
                  aria-label="Save (freeze)"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                       aria-hidden="true">
                    {/* Floppy disk outline */}
                    <path d="M4 4h12l4 4v12H4V4z" />
                    {/* Label area */}
                    <rect x="8" y="4" width="6" height="6" rx="1" />
                    {/* Bottom section */}
                    <rect x="8" y="15" width="8" height="5" rx="1" />
                  </svg>
                </button>

                {/* Download PNG */}
                <button
                  onClick={handleSave}
                  className="px-3 py-1.5 rounded-md text-sm text-white"
                  style={{ backgroundColor: '#4f46e5' }}
                  title="Download PNG"
                  aria-label="Download PNG"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                       aria-hidden="true">
                    <path d="M12 3v10" />
                    <path d="M8 11l4 4 4-4" />
                    <path d="M5 21h14" />
                  </svg>
                </button>
    </>
  )

  return (
    <div className={`h-app w-full bg-gray-50 overflow-hidden ${isLandscape ? 'flex' : 'flex flex-col'}`}>
      {!isLandscape ? (
        // Portrait: top bar (wraps to two rows) + canvas below
        <>
          <div className="w-full bg-white border-b border-gray-200 shadow-sm relative z-50">
            <div className={`flex flex-wrap items-center gap-2 p-2 overflow-visible ${toolbarReady ? '' : 'opacity-0 pointer-events-none'} ${isMagicRunning ? 'pointer-events-none' : ''}`}>
              {ToolbarInner}
            </div>
          </div>
          <div className="flex-1 min-h-0 p-2 sm:p-3">
            <div ref={containerRef} className="relative h-full rounded-xl shadow-sm bg-white">
              <Canvas
                ref={canvasRef}
                expression={expr}
                params={params}
                lineColor={lineColor}
                bgColor={bgColor}
                tiltAngle={tilt}
                lineWidth={lineWidth}
                lineOpacity={lineOpacity}
                activeTool={activeTool}
                fillParent={true}
              />
              <div
                onClick={handleBucketClick}
                className="absolute left-0 right-0 bottom-0"
                style={{
                  top: 0,
                  pointerEvents: activeTool === 'bucket' && !isAnyMenuOpen ? 'auto' : 'none',
                  cursor:
                    activeTool === 'bucket'
                      ? (bucketCursorUrl
                          ? `url("${bucketCursorUrl}") ${Math.max((bucketCursorSize?.w || 0) - 1, 0)} ${Math.max((bucketCursorSize?.h || 0) - 1, 0)}, auto`
                          : 'crosshair')
                      : 'auto',
                  zIndex: 5,
                  background: 'transparent',
                }}
              />
            </div>
          </div>
        </>
      ) : (
        // Landscape: canvas on left, two-column menu on right sidebar
        <>
          <div className="flex-1 min-w-0 min-h-0 p-2 sm:p-3">
            <div ref={containerRef} className="relative h-full rounded-xl shadow-sm bg-white">
              <Canvas
                ref={canvasRef}
                expression={expr}
                params={params}
                lineColor={lineColor}
                bgColor={bgColor}
                tiltAngle={tilt}
                lineWidth={lineWidth}
                lineOpacity={lineOpacity}
                activeTool={activeTool}
                fillParent={true}
              />
              <div
                onClick={handleBucketClick}
                className="absolute left-0 right-0 bottom-0"
                style={{
                  top: 0,
                  pointerEvents: activeTool === 'bucket' && !isAnyMenuOpen ? 'auto' : 'none',
                  cursor:
                    activeTool === 'bucket'
                      ? (bucketCursorUrl
                          ? `url("${bucketCursorUrl}") ${Math.max((bucketCursorSize?.w || 0) - 1, 0)} ${Math.max((bucketCursorSize?.h || 0) - 1, 0)}, auto`
                          : 'crosshair')
                      : 'auto',
                  zIndex: 5,
                  background: 'transparent',
                }}
              />
            </div>
          </div>
          <div className="w-64 md:w-72 bg-white border-l border-gray-200 shadow-sm relative z-50 p-2 overflow-visible">
            <div className={`grid grid-cols-2 gap-2 items-start ${toolbarReady ? '' : 'opacity-0 pointer-events-none'} ${isMagicRunning ? 'pointer-events-none' : ''}`}>
              {ToolbarInner}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
