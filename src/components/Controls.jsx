import React from 'react'
import { motion } from 'framer-motion'

const RANDOM_FUNCTIONS = [
  'sin(a*x + b)*c',
  'cos(a*x)*c',
  'tan(a*x + b)',
  'exp(sin(x))*c',
  'abs(sin(a*x))*c',
]

export default function Controls({
  expr, onExprChange,
  params, onParamChange,
  lineColor, onLineColorChange,
  bgColor, onBgColorChange,
  lineWidth, onLineWidthChange,
  lineOpacity, onLineOpacityChange,
  onReset, onSave, onRandom,
  onFreeze,
  onTilt, tiltAngle,
  activeTool, onActiveToolChange,
  hideCoreButtons
}) {
  const pickRandom = () => {
    const choice = RANDOM_FUNCTIONS[Math.floor(Math.random() * RANDOM_FUNCTIONS.length)]
    onRandom?.(choice)
  }

  const Button = ({ children, onClick, className }) => (
    <motion.button
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -1 }}
      onClick={onClick}
      className={
        // base: readable text, padding, rounded, subtle border (no bg-* to avoid overriding variant colors)
        'px-4 py-2 rounded-lg shadow-sm border border-gray-200 text-gray-800 hover:shadow transition ' + (className || '')
      }
    >
      {children}
    </motion.button>
  )

  return (
    <div className="space-y-4">
      <div className="rounded-xl shadow-sm bg-white p-4 space-y-3">
        <label className="block text-sm font-medium text-gray-700">Function f(x)</label>
        <input
          type="text"
          value={expr}
          onChange={e => onExprChange(e.target.value)}
          placeholder='e.g. sin(a*x + b)*c'
          className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {/* Parameter sliders moved up under function input */}
        <div className="space-y-3">
          {['a','b','c'].map(k => (
            <div key={k} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Parameter {k}</span>
                <span className="text-gray-600">{params[k].toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={-10}
                max={10}
                step={0.01}
                value={params[k]}
                onChange={e => onParamChange(k, parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={pickRandom} className="flex-1">Random Function</Button>
          {!hideCoreButtons && (
            <>
              <Button onClick={onTilt}>Tilt ({Math.round((tiltAngle||0))}°)</Button>
              <Button onClick={onReset}>Reset</Button>
              <Button onClick={onFreeze} className="border-emerald-600 focus:outline-none bg-emerald-600 text-white hover:bg-emerald-500" style={{ backgroundColor: '#059669', color: '#ffffff', borderColor: '#059669' }}>Save</Button>
              <Button onClick={onSave} className="border-indigo-600 focus:outline-none bg-indigo-600 text-white hover:bg-indigo-500" style={{ backgroundColor: '#4f46e5', color: '#ffffff', borderColor: '#4f46e5' }}>Download</Button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl shadow-sm bg-white p-4 space-y-3">
        <div className="flex items-center gap-4">
          {/* Line color tool */}
          <button
            type="button"
            onClick={() => onActiveToolChange('line')}
            className={`relative flex items-center justify-center w-10 h-10 rounded-md border ${activeTool==='line' ? 'border-indigo-500 ring-2 ring-indigo-300' : 'border-gray-200'} bg-white hover:bg-gray-50`}
            title="Line tool"
          >
            {/* Simple line icon */}
            <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700">
              <line x1="4" y1="20" x2="20" y2="4" />
            </svg>
            {/* Color indicator */}
            <span
              aria-hidden
              className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border border-white shadow"
              style={{ backgroundColor: lineColor }}
            />
            <input
              type="color"
              value={lineColor}
              onChange={e => onLineColorChange(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
              aria-label="Line color"
            />
          </button>
          {/* Paint bucket tool */}
          <button
            type="button"
            onClick={() => onActiveToolChange('bucket')}
            className={`relative flex items-center justify-center w-10 h-10 rounded-md border ${activeTool==='bucket' ? 'border-indigo-500 ring-2 ring-indigo-300' : 'border-gray-200'} bg-white hover:bg-gray-50`}
            title="Paint bucket (fill)"
          >
            {/* Bucket icon */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700">
              <path d="M3 12l9-9 4.5 4.5L7.5 16.5 3 12z" />
              <path d="M14.5 5.5l4 4" />
              <path d="M5 18c1.5 1 3.5 1 5 0" />
              <path d="M19 14c-.5 1.5-1.5 3-3 4" />
            </svg>
            {/* Fill color indicator (drop shape) */}
            <span
              aria-hidden
              className="absolute -bottom-1 -right-1 w-4 h-4 rounded-sm rotate-45 border border-white shadow"
              style={{ background: bgColor }}
            />
            <input
              type="color"
              value={bgColor}
              onChange={e => onBgColorChange(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
              aria-label="Fill color"
            />
          </button>
        </div>
        <div className="space-y-1 pt-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Line thickness</span>
            <span className="text-gray-600">{lineWidth.toFixed(1)} px</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={lineWidth}
            onChange={e => onLineWidthChange(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Line opacity</span>
            <span className="text-gray-600">{Math.round(lineOpacity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={lineOpacity}
            onChange={e => onLineOpacityChange(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>
      </div>
    </div>
  )
}
