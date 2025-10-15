# fxART

Create generative art using math functions. Built with React, Vite, TailwindCSS, math.js, and Framer Motion.

## Features
- Live function input evaluated with math.js
- Sliders for parameters a, b, c (-10 to 10)
- Line/background color pickers
- Random function button
- Pixel-perfect canvas scaling and instant redraws
- Reset (clear) and Save (PNG)

## Quick start (Windows PowerShell)

```powershell
npm install
npm run dev
```

Open the URL shown (usually http://localhost:5173) in your browser.

## Build

```powershell
npm run build
npm run preview
```

## Notes
- Function examples: `sin(a*x + b)*c`, `cos(a*x)*c`, `tan(a*x + b)`, `exp(sin(x))*c`, `abs(sin(a*x))*c`.
- The canvas maps x from -10..10 and y from -5..5 by default.
- Reset clears to the current background color. Save downloads a PNG of the current canvas.
