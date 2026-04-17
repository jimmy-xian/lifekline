# Runtime And Risks

## Runtime model is mixed

This repo mixes several assumptions:

- Vite app with `npm run dev` and `npm run build`
- `index.html` with Tailwind CDN and `importmap`
- a serverless-style `api/chat.js`
- GitHub Pages workflow that uploads the whole repo as static content

Treat deployment changes carefully. Static hosting and serverless API hosting are not interchangeable.

## What this means in practice

- A pure GitHub Pages deployment will not natively run `api/chat.js`.
- A pure Vite dev server also does not automatically emulate Vercel serverless routes.
- Some code still reflects an older “user provides API config” model.
- Some code reflects a newer “backend holds the API key” model.

## Recommended maintenance stance

- Unless the task is explicitly about deployment migration, preserve the current user-visible behavior.
- If a change forces a runtime decision, make that decision explicit in the response and docs.
- Prefer documenting known gaps over silently masking them.

## Minimum validation

- `npm run build` for frontend-impacting code changes
- manual inspection of request/response contracts when changing `/api/chat`
- dependency review if backend imports new packages
