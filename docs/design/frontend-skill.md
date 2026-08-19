# Front-end Skill — the working method for UI executors

> Read this **before touching any interface code**, then read
> [`ux-v2.md`](./ux-v2.md) — the design doctrine. This file is the *method*;
> the doctrine is the *spec*. Where they seem to disagree, the doctrine wins.
> Every UI card cites the doctrine's acceptance checklist; your deliver names the
> checklist items it closes.

## 1. Working order (mandatory, in this sequence)

1. **Read the doctrine** (`docs/design/ux-v2.md`): §1 direction, §2 tokens,
   the §3 spec for the component you are touching, §5 checklist, §6 scope map.
   Confirm your card *owns* what you are about to edit — the scope map's
   "must not touch" column is a hard boundary.
2. **Find the tokens for your component.** Everything visual comes from
   `--oc-*` custom properties (themes live in `apps/web/src/styles/themes/`).
   **Never write a hex, rgba, or magic px literal in a component rule.** If the
   token you need does not exist, stop (see §5) — do not invent a value.
3. **Implement.** Follow the component spec exactly (heights, paddings, radii,
   type ramp 22/16/13/12/11, weights 400/500/600 only). UI face for interface
   text; data face (mono) only for ids, counts, money, timestamps, code.
4. **Give every control its five states**: `rest`, `hover`, `open`, `active`,
   `focus`. The Control anatomy (32px height · 1px border · 8px radius · 14px
   SVG icon) applies to every bar trigger. Focus uses the existing ring token —
   visible, outside the control, never resizing it.
5. **Verify at 1440 / 1100 / 900 / 700 px.** No horizontal scroll, no wrapped
   L1 topbar, no clipped panels, mission chip behavior per spec. Then run
   `pnpm test` and the typecheck; both green.
6. **Commit and push before `task_deliver`.** A modified working tree is not a
   delivery. Send the pushed hash in the deliver, plus the evidence of §4 below.

## 2. Craft rules models get wrong

- **Hierarchy by weight and size, never by color.** If two texts must differ,
  move one step on the type ramp or one weight — do not tint one blue.
- **One accent.** Emphasis, selection and the primary action use `--oc-accent`.
  `--oc-ok`/`--oc-danger` appear *only* on status dots, status/error text and
  destructive actions — never on tags, counters, or borders-as-decoration.
- **Air between groups.** Minimum 16px gap between logical groups (e.g. the
  wordmark and the first control). Density is bought with padding and type
  size, never by shrinking targets.
- **The Control** is one anatomy for all bar triggers: 32px / 1px `--oc-border`
  / 8px radius / 13px 500 label / 14px stroke-1.5 SVG icon / 6px internal gap.
  Nothing in a bar is bare text; nothing is a pill toggle.
- **44px tap floor** (`--oc-tap`) on every interactive element. Visual height
  can be 32px; the hit area cannot be under 44px.
- **AA contrast** (≥4.5:1) for text; check text-3 on surface-2 combinations.
- **Hover is color, not motion**: surface/border/text change in 150–300ms with
  the standard ease. No scale transforms — they shift layout.
- **Monospace is a data voice.** Ids (`OCL-27`), counts, money, timestamps,
  code. Interface prose, labels and buttons speak the UI face.
- **Icons are SVG** (Lucide/Heroicons, fixed viewBox, stroke 1.5). Emojis are
  never icons. Clickable things get `cursor: pointer`.
- **`prefers-reduced-motion`** disables non-essential animation.

## 3. Forbidden — with the receipts from this very repo

These shipped here once and were killed by the doctrine. Do not reintroduce them:

| Forbidden | Where it lived | What to do instead |
|---|---|---|
| Colored type badges (`.tag.bug` red, `.tag.feature` blue) | `nebula.css:927–929` | Plain text word in the meta line; a bug may carry the one permitted 3px left tick in `--oc-danger` @40% |
| Amber/blue accents on counters and data | `nebula.css:983–1003` | text-2/text-3 gray; money gets weight, not color |
| Gradient on the account button | `--nebula-btn-account-border` | Same 1px gray border as every other control |
| Glow shadows on status dots | `.agent-status .dot` | Flat 7px dot, no halo |
| Bare-text trigger glued to the wordmark ("Filtros" as a gray pill) | `.ff-trigger`, `nebula.css:532` | The Control anatomy + ≥16px gap from the wordmark |
| Mono-at-10px as the whole interface | `body` and most controls | UI face 13px/500 for interface, mono for data only |
| Unlabeled number rows (`~$27.10 ~175.2M · ~4h14 (4)`) | topbar stat | "Custo ~US$ 27,10 · 175M tokens · 4h14"; the `(4)` becomes a popover line |

## 4. Visual verification without an authenticated session

The board's `/home` needs login, so verify the way OCL-24 did:

1. Build and run the web app locally (`pnpm --filter @agent-board/web build`,
   then start it against the test database, or use the repo's integration
   harness). For pure CSS/layout work, a storybook-less shortcut is rendering
   the component route with the dev server and a seeded session cookie from the
   test helpers.
2. Screenshot with headless Chrome/CDP at the four widths:
   `chrome --headless --screenshot=out-1440.png --window-size=1440,900 <url>`
   (repeat for 1100/900/700). Inspect each: no horizontal scroll, no clipped
   column, control states correct.
3. **Attach as evidence in the deliver**: the four screenshot filenames with a
   one-line verdict each, the test/typecheck summary, and the doctrine
   checklist items (§5, by number) your change closes. If you could not verify
   visually, say so explicitly in the deliver — never imply a check you didn't run.

## 5. Stop rule

If the doctrine does not cover your case — a missing token, a component with no
spec, a conflict between the spec and reality — **STOP. Do not invent.** Comment
on your card describing the gap in one paragraph and wait for the doctrine to be
amended. A wrong guess costs a redesign; a comment costs a minute. The same
applies when your change would require touching another card's scope: comment,
don't trespass.
