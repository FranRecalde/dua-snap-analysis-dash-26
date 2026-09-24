Keep GEMINI.md and AGENTS.md identical. If you change one, change the other.
# Project Rules: Class Snapshot Dashboard

1. **Browser only**: No AI at runtime. Nothing sent to any server.
2. **Pupil data in memory only**: Pupil data (snapshot, class lists, QLA) lives in memory only. Never write it to `localStorage`, files, or logs.
3. **Self-containment**: The app must never fetch, iframe or load a copy of itself. No "am I in an iframe" checks.
4. **No sample data**: Never auto load sample data.
5. **Parser protection**: Do not edit `src/qlaParser.js` or `tests/qla-parser.test.js` without asking first.
6. **Scoped changes**: One change per prompt. Do not restyle or change existing sections unless the prompt explicitly says so.
7. **Invented test data only**: Use invented data only in tests. Never open or read real `.xlsx` files on this computer.
8. **No page navigation**: There is no page navigation. Do not create one.
9. **Rigorous verification & reporting**: After every change, run the full test suite and report: files changed, tests added, pass and fail counts.
10. **British English & UK conventions**: British English in all UI text. UK date format (e.g., 23 September 2026).
