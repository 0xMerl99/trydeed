# Deed design system: the chalkboard

**OWN THE FEES.** · Launch a coin. Receive the Deed. Auction the rights.

The UI is a **dark chalkboard**: a green-black slate, lettering and outlines in chalk, and gold chalk for the one thing
you should do next. Everything is original: the type, the doodles, the logo, the wording and the way boxes are drawn.
The structure (pages, flows, information architecture) follows [REFERENCE.md](REFERENCE.md).

## The brand palette, as chalk

The five given colours keep their meaning; on a board they play different roles.

| Brand colour | Role on the board | Token | Value |
| --- | --- | --- | --- |
| Paper `#F5F5F4` | **Chalk**: text, outlines, filled pills | `ink` | `#F5F5F4` |
| Ink `#0A0A0A` | **The board**: page, panels (slate-tinted) | `paper` · `deep` · `surface` | `#131E18` · `#0D1511` · `#182520` |
| Gold `#D4A017` | **Gold chalk**: primary actions, rules, numbers, the wavy underline | `gold` | `#D4A017` |
| Soft `#A1A1AA` | Dim chalk: secondary text on dark | `soft` · `muted` | `#A1A1AA` · `#B4B9B3` |
| Stone `#E7E5E4` | Chalk dust: chips, hovers, fills | `stone` | `#243229` |

Status chalk: green `#8FDCA0` (live), red `#F28B82` (danger, outbid). All text/background pairs pass WCAG AA
(axe reports 0 contrast violations).

> Token **names** are semantic to how components use them (`ink` is the text colour, `paper` is the page colour), so the
> theme can change without touching a component. Dark surfaces (ticker, floor card, footer, code) use `deep`.
> Tokens live in [`src/app/globals.css`](../src/app/globals.css) under `@theme`.

## Type

| Role | Face | Notes |
| --- | --- | --- |
| Headlines, card titles | **Fredericka the Great** | Chalk lettering. One weight; faux bold is disabled |
| Body, labels, buttons | **Kalam** 300 / 400 / 700 | A readable hand. `font-size-adjust` keeps its small x-height legible |
| Amounts, countdowns, addresses | **JetBrains Mono**, tabular figures | Numbers never jump width |

All three are open-licence Google fonts, self-hosted at build time through `next/font`.

## How the chalk effect is made (all CSS, no images)

| Effect | Technique |
| --- | --- |
| The board | Three soft radial gradients (lamp-light, a warm corner, a dark foot) on the slate |
| Chalk dust | A fixed, non-interactive SVG-noise overlay at ~7 % opacity (`body::after`), plus the same noise on gold fills |
| Hand-drawn boxes | 2 px chalk line, deliberately **uneven corner radii**, and a board-coloured gap + faint second stroke (`--chalk-edge`). Applied centrally to every `rounded-xl border` card, so components need no extra class |
| Inputs | Dashed chalk boxes; solid chalk with a gold glow on focus |
| Filters | Chalk **ovals** (`chip`) |
| Labels | A strip of chalk-white tape, rotated ~1° (`eyebrow`) |
| Emphasis | A wavy gold chalk underline on the last word of each title (`hl`, an inline SVG background) |
| Buttons | Chalk outline; the primary one is filled with gold chalk (grain overlay), dark lettering |
| Footer | A wooden **chalk tray** with three sticks of chalk |
| Doodles | A gavel, sparkles and an arrow with a note around the hero's Deed ([`ChalkDoodles`](../src/components/home/ChalkDoodles.tsx)), original line art |

Focus rings are gold and are never replaced by the card styling (cards use `box-shadow`, not `outline`).

## Logo

A landscape **title deed**: a chalk border, a gold inner rule, three lines of text, a small gold seal: an ownership
document, not a token logo. Wordmark `DEED` `.` `FUN` in chalk lettering with a gold full stop. It scales down on phones so
a connected wallet chip always fits beside it.
Assets: [`public/brand`](../public/brand) (`deed-mark.svg`, `deed-mark-dark.svg`, `deed-logo.svg`, PNG icons), favicon
[`src/app/icon.svg`](../src/app/icon.svg), touch icon and the 1200×630 social card (regenerate with
`node scripts/brand/generate.mjs`).

## The Deed, as a component

[`DeedCertificate`](../src/components/deed/DeedCertificate.tsx) renders the 1/1 Ownership NFT as the document it is: a
chalk-ruled card with a gold inner rule and a seal. It is the hero art. It only shows what is known: an unminted Deed says
"Pending launch"; a minted one shows the real Deed mint and its current holder.

## Voice

Short, specific sentences. Mechanics stated plainly. Preferred phrases: *Own the fees. Auction the Deed. Take over the
fee rights. Claim creator fees. One coin. One Deed. The rights to the coin.* No hype.

## Components

`btn` (default · gold · ink · ghost · danger; sm/md/lg) · `chip` (filters/sort, `aria-pressed`) · `pill` ·
`panel` · `kv` / `stat-grid` · `field` / `inp` (value + unit) · `tbl` · `tabs` · `steps` · `notice` / `warn` /
`sim-note` · native-`<dialog>` `Modal` (bottom sheet < 640 px) and `drawer` · toast (one polite live region, a stick of
chalk-white) · `skeleton` · `empty` · `chalk-tray`.

## Responsive

Desktop nav ≥ 1200 px; below that a slide-over drawer (the reference instead stacks four header rows on phones).
Named breakpoints in `@theme` (`w640`, `w901`, `w981`, `w1181`, …) because Tailwind v4 does not order arbitrary
`min-[…]` variants against theme screens. Tables scroll inside their own container; sticky side panels are sticky only
when the viewport is tall enough to show them whole. Decorative doodles that sit outside their box are hidden on narrow
screens so they can never widen the page.
