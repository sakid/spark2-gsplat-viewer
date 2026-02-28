# Contributing

## File size and structure expectations

- New source files should stay under **600 lines** unless there is a strong reason and it is documented in the PR.
- Hard enforcement checks:
  - Source files above 1200 lines fail `npm run check:file-sizes`.
  - General source files above 1200 lines fail `npm run check:lines`.
  - Binary files above 100 MB fail `npm run check:file-sizes` unless explicitly allowlisted.

## Temporary source exception

- `src/main.ts` is temporarily exempt in line-count checks while migration to feature modules is in progress.

## Before opening a PR

Run:

```bash
npm run check:file-sizes
npm test
npm run build
```
