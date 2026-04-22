---
name: lifekline-maintainer
description: Maintain, debug, or extend the LifeKLine repository. Use when Codex needs to work on this app's React 19 + Vite + TypeScript frontend, FastAPI `/api/chat` backend, BaZi prompt generation, segmented year-range analysis flow, debug output pipeline, or shared data contracts between form inputs, model responses, charts, and report rendering.
---

# LifeKLine Maintainer

## Quick workflow

1. Read `AGENT.md` first for the repo-level overview and known pitfalls.
2. Identify which layer the request touches:
   - UI and form flow
   - prompt generation and segmented request strategy
   - `/api/chat` backend behavior
   - result parsing, debug capture, and chart/report rendering
   - deployment or local runtime assumptions
3. Load only the relevant reference file from `references/`.
4. Make the smallest change that preserves the current product flow.
5. Validate with the lightest relevant check, usually `npm run build` for code changes.

## File map

- `App.tsx`: top-level flow, loading, error, result state
- `components/BaziForm.tsx`: user inputs and form validation
- `services/geminiService.ts`: prompt generation, total-outline request, segmented range requests, response parsing, and debug capture
- `backend/main.py`: FastAPI backend entry that proxies `/api/chat` requests to an OpenAI-compatible model endpoint
- `components/LifeKLineChart.tsx`: chart rendering
- `components/AnalysisResult.tsx`: textual analysis rendering
- `types.ts`: shared contracts
- `constants.ts`: system instruction and service flags
- `vite.config.ts`: local `/api/*` proxy configuration

## Decision guide

### If the request changes inputs or form UX

Read `references/ui-and-types.md`.

Focus on:

- `UserInput` compatibility
- whether string input fields are parsed correctly downstream
- whether model config and debug fields still flow through correctly
- preserving Chinese UX text and the current data-entry flow

### If the request changes AI behavior or output schema

Read `references/prompt-and-api.md`.

Focus on:

- the contract between `BAZI_SYSTEM_INSTRUCTION` and `generateLifeAnalysis`
- the two-stage flow: total outline first, segmented year ranges second
- JSON stability
- backend/frontend agreement on request and response shapes

### If the request is about bugs, refactors, or deployment confusion

Read `references/runtime-and-risks.md`.

Focus on:

- the actual runtime model: Vite frontend plus FastAPI backend
- proxy and local dev assumptions
- long-range model stability risks
- whether the requested fix preserves segmented request merging and debug visibility

## Working rules for this repo

- Prefer targeted fixes over architecture rewrites.
- Treat `types.ts` as the shared contract center.
- When changing prompt fields or response schema, inspect both the prompt builder and the result parser.
- When changing API behavior, inspect both `backend/main.py` and `services/geminiService.ts`.
- Treat `modelName`, `apiBaseUrl`, `apiKey`, and `debugMode` as live fields unless the code you are editing clearly removes them.
- Preserve the current segmented request flow unless the task explicitly changes that strategy.
- Call out inconsistencies explicitly in reviews rather than silently normalizing them.

## Validation

- For UI, service, or type changes: run `npm run build`.
- For backend-only Python changes: run `python -m py_compile backend/main.py`.
- For documentation-only work: verify links and file paths.
- For backend route changes: confirm the returned JSON shape still matches the frontend parser.
- For segmented analysis changes: verify merged `chartPoints` remain complete, ordered, and continuous across age ranges.

## References

- `references/ui-and-types.md`: UI flow and data contracts
- `references/prompt-and-api.md`: prompt generation and backend integration
- `references/runtime-and-risks.md`: deployment assumptions and known repo risks
