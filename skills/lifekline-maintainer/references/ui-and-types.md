# UI And Types

## Primary flow

The visible user journey is:

1. `App.tsx` renders intro content and `BaziForm`.
2. `BaziForm.tsx` collects:
   - optional name
   - gender
   - birth year
   - four pillars
   - start age
   - first Da Yun
   - legacy API config fields
3. `App.tsx` calls `generateLifeAnalysis`.
4. Success switches the screen into report mode with chart + analysis cards.

## Shared types

`types.ts` is the contract source for:

- `UserInput`
- `KLinePoint`
- `AnalysisData`
- `LifeDestinyResult`

If you change any property in `UserInput`, verify these spots:

- `components/BaziForm.tsx`
- `App.tsx`
- `services/geminiService.ts`

If you change chart or analysis output fields, verify these spots:

- `services/geminiService.ts`
- `components/LifeKLineChart.tsx`
- `components/AnalysisResult.tsx`

## Important current mismatch

`BaziForm.tsx` still validates:

- `modelName`
- `apiBaseUrl`
- `apiKey`

But `services/geminiService.ts` no longer uses them for requests. Before removing or repurposing them, decide whether the product should:

- stay on a backend proxy model
- return to user-supplied API config

Do not leave the UI and service layer in a half-migrated state.
