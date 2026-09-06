# Tembo E1 — concept vehicle design canvas

**Unrelated to the Tathmini assessment application.** Nothing here is imported by
`apps/` or `packages/`, it ships no dependency, and it does not touch the schema,
RLS, auth or any stored mark. It is a standalone design exercise, kept in the
repo only because it was drawn here.

## What this is

A five-artboard design canvas for a fictional concept vehicle: the **Tembo E1**,
a double-cab electric utility pickup drawn around unsealed-road use — 250 mm of
clearance, a 1 435 mm composite bed, a 96 kWh LFP pack.

| File | Artboard |
|---|---|
| `Main.dc.html` | 01 · Side elevation, dimensioned, with feature callouts |
| `Orthographic.dc.html` | 02 · Front, rear and plan views |
| `Spec.dc.html` | 03 · A4 specification sheet (print artboard) |
| `Dashboard.dc.html` | 04 · 1280 × 480 centre-display HMI, working drive-mode selector |
| `Colourways.dc.html` | 05 · Six launch finishes, working paint selector |
| `canvas.json` | Artboard layout, titles and launch view |

Each `.dc.html` is one Design Component — the same file format as the
prototypes in `reference/`. They render together as one pan/zoom canvas.

## Conventions used

- Drawings are 1 : 20 at 96 px per inch; all dimensions in millimetres.
- Type: Space Grotesk (display and body), IBM Plex Mono (data and labels).
- Screen artboards sit on graphite `#14171A`; the spec sheet is a light paper
  artboard so it prints without flooding ink.
- Signal orange `#E4693A` is the single accent across all five sheets.

## Please note

Every figure on the spec sheet is an invented design-freeze target for a
concept. None of it is homologated, tested or type-approved, and the vehicle
does not exist.
