---
name: lifekline-maintainer
description: Use this skill when working on the LifeKLine repository to understand its React/Vite front end, BaZi prompt pipeline, `/api/chat` serverless integration, mixed deployment assumptions, and the key consistency checks needed before editing UI, prompt, API, or data-shape code.
---

# LifeKLine Maintainer

## Overview

Use this skill when the task is about maintaining, extending, debugging, or reviewing the LifeKLine project. The repo is small, but it has a few important cross-file contracts and some historical inconsistencies, so the fastest safe path is to align on the current architecture before editing.

## Quick workflow

1. Read `AGENT.md` first for the repo-level overview and known pitfalls.
2. Identify which layer the request touches:
   - UI/form flow
   - prompt generation
   - `/api/chat` backend behavior
   - result parsing and chart/report rendering
   - deployment/runtime assumptions
3. Load only the relevant reference file from `references/`.
4. Make the smallest change that preserves the existing product flow.
5. Validate with the lightest relevant check, usually `npm run build` for code changes.

## File map

- `App.tsx`: top-level flow, loading, error, result state
- `components/BaziForm.tsx`: user inputs and form validation
- `services/geminiService.ts`: prompt generation and response parsing
- `api/chat.js`: serverless backend entry
- `components/LifeKLineChart.tsx`: chart rendering
- `components/AnalysisResult.tsx`: textual analysis rendering
- `types.ts`: shared contracts
- `constants.ts`: system prompt and service flag

## Decision guide

### If the request changes inputs or form UX

Read `references/ui-and-types.md`.

Focus on:

- `UserInput` compatibility
- whether form-only fields are still consumed downstream
- preserving Chinese UX text and the current data-entry flow

### If the request changes AI behavior or output schema

Read `references/prompt-and-api.md`.

Focus on:

- the contract between `BAZI_SYSTEM_INSTRUCTION` and `generateLifeAnalysis`
- JSON stability
- backend/frontend agreement on request and response shapes

### If the request is about bugs, refactors, or deployment confusion

Read `references/runtime-and-risks.md`.

Focus on:

- mixed static/Vite/serverless assumptions
- missing dependencies
- duplicated backend code
- whether the requested fix picks one runtime model or preserves both

## Working rules for this repo

- Prefer targeted fixes over architecture rewrites.
- Treat `types.ts` as the shared contract center.
- When changing prompt fields, inspect both the prompt builder and the result parser.
- When changing API behavior, inspect both `api/chat.js` and `services/geminiService.ts`.
- Do not assume the form's API config fields are active just because they exist in the UI.
- Call out inconsistencies explicitly in reviews rather than silently normalizing them.

## Validation

- For UI, service, or type changes: run `npm run build`.
- For documentation-only work: verify links and file paths.
- For backend route changes: confirm the returned JSON shape still matches the frontend parser.

## References

- `references/ui-and-types.md`: UI flow and data contracts
- `references/prompt-and-api.md`: prompt generation and backend integration
- `references/runtime-and-risks.md`: deployment assumptions and known repo risks
