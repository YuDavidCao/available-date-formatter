# Available Date Formatter

Drag across a week grid to mark when you're free (or blocked), then copy it as text, PNG, a share link, or an `.ics` file. Everything runs in the browser — share links encode the times in the URL hash, nothing is uploaded.

Astro + React + Tailwind v4. The whole app is one `client:only` React island (`src/App.tsx`); it reads `window.location.hash` at module scope, so there's nothing to prerender.

```bash
npm run dev      # astro dev
npm run build    # astro check && astro build
npm run preview  # serve dist/
npm test         # vitest
npm run lint     # oxlint
```

```
src/
  pages/index.astro   shell + island mount
  App.tsx             UI, state, URL sync
  components/         WeekGrid
  lib/                time, format, url codec, export
```
