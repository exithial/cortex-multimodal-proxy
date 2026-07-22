# Task 13 Follow-up Report

## Files modified

- `src/services/deepseekBrainProvider.ts`
- `src/services/minimaxM3VisionProvider.ts`
- `src/services/opencodeGoBrainProvider.ts`
- `src/services/providerSelector.ts`
- `tests/unit/services/deepseekBrainProvider.test.ts`
- `tests/unit/services/minimaxM3VisionProvider.test.ts`
- `tests/unit/services/opencodeGoBrainProvider.test.ts`

Provider API-key validation now runs in constructors; unavailable singleton exports remain null until the selector initializes the active provider. Tests instantiate exported provider classes explicitly for missing-key cases.

## Test results

- `npm run test:unit`: PASS — 16 test files, 194 tests.
- `npm run build`: PASS.
- `npm run lint`: PASS, with the existing Node `MODULE_TYPELESS_PACKAGE_JSON` warning.
- `git diff --check`: PASS.

## Smoke test results

1. `OPENCODE_GO_API_KEY=sk-x BRAIN_MODE=auto`: PASS — prints 4 OpenCode Go brain IDs.
2. `DEEPSEEK_API_KEY=sk-d BRAIN_MODE=auto MINIMAX_API_KEY=sk-m`: PASS — prints `deepseek`.
3. `OPENCODE_GO_API_KEY=sk-x DEEPSEEK_API_KEY=sk-d MINIMAX_API_KEY=sk-m BRAIN_MODE=hybrid`: PASS — prints `hybrid 6`.

## Updated tag

Pending: `v3.1.1-pluggable-providers` will be created after the requested commit.
