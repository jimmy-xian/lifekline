# Prompt And API

## Prompt pipeline

`services/geminiService.ts` does three important things:

1. Derives Da Yun direction from gender and year stem polarity.
2. Builds a long Chinese prompt with explicit sequencing rules.
3. Calls `/api/chat`, then parses the model response as JSON.

## Prompt contract

The prompt builder and `constants.ts` together define the expected output shape. The frontend expects:

- top-level text sections such as `summary`, `industry`, `wealth`
- numeric scores
- `chartPoints` as the array source for K-line rendering

The parser strips Markdown code fences before `JSON.parse`.

## Backend contract

`api/chat.js` currently:

- only reads `prompt`
- returns `{ result: text }`

The frontend currently sends:

- `prompt`
- `systemInstruction`

That means the backend and frontend are not fully aligned. If you fix this, update both sides together.

## Known backend risks

- `api/chat.js` content is duplicated in the same file.
- `@google/generative-ai` is imported but not declared in `package.json`.
- The route currently hardcodes `gemini-pro`.

## Safe editing pattern

- Keep output field names stable unless the task explicitly changes the schema.
- If the schema changes, patch parser, chart mapping, and analysis mapping in the same pass.
- If the backend starts consuming `systemInstruction`, document the new request contract in `AGENT.md`.
