import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { create, all } from 'mathjs'

const math = create(all, {})

const X_RANGE = { min: -10, max: 10 }

function drawFunction(ctx, canvas, compiled, scope, lineColor, bgColor, tiltAngleDeg = 0, skipClear = false, lineWidth = 2, lineOpacity = 1) {
  const dpr = canvas._dpr || 1
  const width = canvas.width / dpr
  const height = canvas.height / dpr
  // Clear and background (operate in CSS pixels; transform handles DPR)
  if (!skipClear) {
    ctx.save()
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = bgColor || '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }

  // axes scaling
  const xMin = X_RANGE.min
  const xMax = X_RANGE.max
  const yMin = -5
  const yMax = 5

  const pxPerX = width / (xMax - xMin)
  const pxPerY = height / (yMax - yMin)

  // --- Overscan logic ----------------------------------------------------
  // When we rotate the drawing, the original horizontal domain [0,width]
  // becomes a rotated strip. The line endpoints (at xMin/xMax) can become
  // visible inside the canvas bounds for non-zero angles. To keep the
  // function appearing continuous (no visible start/end inside view), we
  // extend the pixel drawing range horizontally by an overscan margin so
  // endpoints lie off-canvas after rotation.
  // Horizontal extent of rotated canvas: W' = |W cosθ| + |H sinθ|
  // Required extra width = W' - W. We distribute half on each side.
  const rad = (tiltAngleDeg * Math.PI) / 180
  const rotatedWidth = Math.abs(width * Math.cos(rad)) + Math.abs(height * Math.sin(rad))
  const overscanPx = Math.max(0, (rotatedWidth - width) / 2)
  // Scale x mapping to include overscan while keeping mathematical domain same.
  // Pixel range becomes [-overscanPx, width + overscanPx]
  const pxPerXExt = (width + 2 * overscanPx) / (xMax - xMin)

  ctx.save()
  // Apply tilt by rotating around the center
  if (tiltAngleDeg) {
    const cx = width / 2
    const cy = height / 2
    ctx.translate(cx, cy)
    ctx.rotate(rad)
    ctx.translate(-cx, -cy)
  }
  ctx.beginPath()
  // Increase steps proportional to extended width for smoothness when overscanned
  const effectiveWidth = width + 2 * overscanPx
  const steps = Math.max(300, Math.floor(effectiveWidth)) // smooth relative to effective width
  let first = true
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = xMin + t * (xMax - xMin)
    scope.x = x
    let y
    try {
      const val = compiled.evaluate(scope)
      y = typeof val === 'number' ? val : Number(val)
      if (!isFinite(y)) {
        first = true
        continue
      }
    } catch {
      first = true
      continue
    }
    // map to pixel coords
    // Map to extended pixel coordinate and then shift left by overscan
    const px = (x - xMin) * pxPerXExt - overscanPx
    const py = height - (y - yMin) * pxPerY
    if (first) {
      ctx.moveTo(px, py)
      first = false
    } else {
      ctx.lineTo(px, py)
    }
  }
  // Apply stroke styles
  ctx.globalAlpha = Math.min(1, Math.max(0, lineOpacity || 1))
  ctx.lineWidth = Math.max(0.5, Number(lineWidth || 2))
  ctx.strokeStyle = lineColor || '#111827'
  ctx.stroke()
  ctx.restore()
  // Reset global alpha for subsequent operations
  ctx.globalAlpha = 1
}

const Canvas = forwardRef(function Canvas({
  expression,
  params,
  lineColor,
  bgColor,
  tiltAngle = 0,
  lineWidth = 2,
  lineOpacity = 1,
  heightVh = 60,
  activeTool = 'line',
  fillParent = false
}, ref) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const compiledRef = useRef(null)
  const [error, setError] = useState(null)
  const frozenImageRef = useRef(null) // HTMLImageElement holding last frozen render
  const usedExpressionsRef = useRef(new Set()) // Track all valid expressions rendered
  const resizeObserverRef = useRef(null)

  // compile on expression change
  useEffect(() => {
    // Compile current expression, but do NOT track it yet. We only record
    // expressions that were actually frozen (baked) into the canvas.
    try {
      const compiled = math.compile(expression || '0')
      compiledRef.current = compiled
      setError(null)
    } catch (e) {
      compiledRef.current = null
      setError('Invalid function')
    }
  }, [expression])

  // resize handler
  const fitCanvas = () => {
    const canvas = canvasRef.current
    const parent = containerRef.current
    if (!canvas || !parent) return
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const cssWidth = parent.clientWidth
    const cssHeight = fillParent
      ? Math.max(0, parent.clientHeight)
      : Math.round(window.innerHeight * (heightVh / 100))
    canvas.style.width = cssWidth + 'px'
    canvas.style.height = cssHeight + 'px'
    canvas.width = Math.floor(cssWidth * dpr)
    canvas.height = Math.floor(cssHeight * dpr)
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    canvas._dpr = dpr
  }

  const render = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const compiled = compiledRef.current
    // Dimensions in CSS pixels
    const dpr = canvas._dpr || 1
    const w = canvas.width / dpr
    const h = canvas.height / dpr
    // First, if there is a frozen image, draw it as the background
    if (frozenImageRef.current) {
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(frozenImageRef.current, 0, 0, w, h)
    }
    const scope = {
      a: Number(params?.a ?? 0),
      b: Number(params?.b ?? 0),
      c: Number(params?.c ?? 0),
      x: 0,
      sin: math.sin,
      cos: math.cos,
      tan: math.tan,
      abs: math.abs,
      exp: math.exp,
      sqrt: math.sqrt,
      pow: math.pow,
    }
    if (compiled) {
        // Draw current function. If we have a frozen background, skip clearing so it stays.
        const skip = Boolean(frozenImageRef.current)
      drawFunction(ctx, canvas, compiled, scope, lineColor, bgColor, tiltAngle, skip, lineWidth, lineOpacity)
    } else if (!frozenImageRef.current) {
      // No compiled function and no frozen background: fill bg
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = bgColor || '#ffffff'
      ctx.fillRect(0, 0, w, h)
    }
  }

  useEffect(() => {
    fitCanvas()
    render()
    const onResize = () => {
      fitCanvas()
      render()
    }
    window.addEventListener('resize', onResize)
    // Also respond to orientation changes and visual viewport updates
    window.addEventListener('orientationchange', onResize)
    window.visualViewport?.addEventListener('resize', onResize)

    // Observe parent size changes (e.g., when the menu wraps or mobile UI changes)
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(() => onResize())
      resizeObserverRef.current = ro
      if (containerRef.current) ro.observe(containerRef.current)
    }

    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
      try { resizeObserverRef.current?.disconnect() } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    render()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expression, params, lineColor, bgColor, tiltAngle, lineWidth, lineOpacity])

  useImperativeHandle(ref, () => ({
    reset: () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      const dpr = canvas._dpr || 1
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = bgColor || '#ffffff'
      ctx.fillRect(0, 0, w, h)
      frozenImageRef.current = null
      usedExpressionsRef.current = new Set()
    },
    save: () => {
      const canvas = canvasRef.current
      if (!canvas) return
      // Create a composite with footer text listing used functions
      const dpr = canvas._dpr || 1
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      const footerLines = []
      const exprs = Array.from(usedExpressionsRef.current)
      if (exprs.length) {
        footerLines.push('Functions used: ' + exprs.join(' | '))
      }
      footerLines.push('Made possible by fxART')
      const footerText = footerLines.join('\n')
      // Measure text using an offscreen canvas
      const off = document.createElement('canvas')
      const ctx = off.getContext('2d')
      const fontSize = 12
      ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`
      const lineHeight = fontSize + 4
      const textWidth = Math.min(w - 20, Math.max(...footerLines.map(l => ctx.measureText(l).width), 0))
      const footerHeight = lineHeight * footerLines.length + 10
      off.width = w * dpr
      off.height = (h + footerHeight) * dpr
      const offCtx = off.getContext('2d')
      offCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // Draw original canvas content
      offCtx.drawImage(canvas, 0, 0, w, h)
      // Footer background with slight separation
      offCtx.fillStyle = '#ffffff'
      offCtx.fillRect(0, h, w, footerHeight)
      offCtx.fillStyle = '#374151' // gray-700
      offCtx.font = ctx.font
      offCtx.textBaseline = 'top'
      let y = h + 5
      footerLines.forEach(line => {
        offCtx.fillText(line, 10, y, w - 20)
        y += lineHeight
      })
      const url = off.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = 'fxart.png'
      a.click()
    },
    freeze: () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = canvas._dpr || 1
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      // Create an image snapshot of current canvas
      const dataUrl = canvas.toDataURL('image/png')
      const img = new Image()
      img.onload = () => {
        // Ensure it scales with current CSS size
        frozenImageRef.current = img
        // Record the expression that produced the just-frozen lines
        if (expression && expression.trim()) {
          usedExpressionsRef.current.add(expression.trim())
        }
        render()
      }
      img.src = dataUrl
    }
  }))

  // Simple fill action: if bucket tool active, clicking fills background with selected bgColor then re-renders (respecting frozen image)
  const handleCanvasClick = (e) => {
    if (activeTool !== 'bucket') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = canvas._dpr || 1
    const cssX = e.nativeEvent.offsetX
    const cssY = e.nativeEvent.offsetY
    const x = Math.floor(cssX * dpr)
    const y = Math.floor(cssY * dpr)
    const iw = canvas.width
    const ih = canvas.height

    // Ensure we have current drawing on canvas before capturing pixels
    // (render normally if no frozen image yet)
    if (!frozenImageRef.current) {
      render()
    }

    let imageData
    try {
      imageData = ctx.getImageData(0, 0, iw, ih)
    } catch {
      return
    }
    const data = imageData.data

    const idx = (y * iw + x) * 4
    const targetR = data[idx]
    const targetG = data[idx + 1]
    const targetB = data[idx + 2]
    const targetA = data[idx + 3]

    // Parse replacement color (bgColor hex -> r,g,b)
    const hex = (bgColor || '#000000').trim()
    const parseHex = (h) => {
      if (h.startsWith('#')) h = h.slice(1)
      if (h.length === 3) {
        return [
          parseInt(h[0] + h[0], 16),
          parseInt(h[1] + h[1], 16),
          parseInt(h[2] + h[2], 16)
        ]
      }
      return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16)
      ]
    }
    const [repR, repG, repB] = parseHex(hex)
    const repA = 255

    // If target equals replacement, nothing to do
    if (targetR === repR && targetG === repG && targetB === repB && targetA === repA) return

    // Flood fill (scanline) exact color match
    const matchTarget = (i) => data[i] === targetR && data[i + 1] === targetG && data[i + 2] === targetB && data[i + 3] === targetA
    const colorPixel = (i) => {
      data[i] = repR; data[i + 1] = repG; data[i + 2] = repB; data[i + 3] = repA
    }
    const stack = [x, y]
    while (stack.length) {
      const cy = stack.pop()
      const cx = stack.pop()
      let left = cx
      let i
      // move left
      while (left >= 0) {
        i = (cy * iw + left) * 4
        if (!matchTarget(i)) break
        left--
      }
      left++
      let right = cx
      while (right < iw) {
        i = (cy * iw + right) * 4
        if (!matchTarget(i)) break
        right++
      }
      // fill span
      for (let px = left; px < right; px++) {
        i = (cy * iw + px) * 4
        colorPixel(i)
        // check pixels above and below for queueing
        if (cy > 0) {
          const upIdx = ((cy - 1) * iw + px) * 4
          if (matchTarget(upIdx)) stack.push(px, cy - 1)
        }
        if (cy < ih - 1) {
          const dnIdx = ((cy + 1) * iw + px) * 4
          if (matchTarget(dnIdx)) stack.push(px, cy + 1)
        }
      }
    }

    ctx.putImageData(imageData, 0, 0)

    // Snapshot resulting image so further re-renders keep fill
    const dataUrl = canvas.toDataURL('image/png')
    const img = new Image()
    img.onload = () => {
      frozenImageRef.current = img
      // After baking, re-render function skipped (we keep baked pixels). If desired to redraw function lines on top, call render() here.
    }
    img.src = dataUrl
  }

  return (
    <div ref={containerRef} className={`w-full ${fillParent ? 'h-full' : ''}`}>
      {error && (
        <div className="mb-2 text-sm text-red-600">{error}</div>
      )}
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className={`w-full rounded-lg border border-gray-200 shadow-sm ${activeTool==='bucket' ? '' : 'cursor-crosshair'}`}
        style={activeTool==='bucket' ? {
          // Hotspot moved near bottom-right corner of 24x24 drawing inside 32x32 cursor box.
          cursor: "url('data:image/svg+xml;utf8,<?xml version=\"1.0\" encoding=\"UTF-8\"?><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"32\" height=\"32\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"%23000000\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 12l9-9 4.5 4.5L7.5 16.5 3 12z\"/><path d=\"M14.5 5.5l4 4\"/><path d=\"M19 14c-.5 1.5-1.5 3-3 4\"/></svg>') 22 22, cell"
        } : undefined}
      />
    </div>
  )
})

export default Canvas
