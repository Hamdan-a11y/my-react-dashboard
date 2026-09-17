# Taste-Skill Frontend Guidelines (Anti-Slop Directive)

Enforce high-agency, anti-generic design engineering across all frontend development, redesigns, landing pages, and components.

## 0. Brief Inference & One-Line Design Read
Before writing any frontend code, infer the user's intent from context and declare a one-line **Design Read**:
`Reading this as: <page/component kind> for <audience>, with a <vibe> language, leaning toward <design system or aesthetic family>.`

## 1. The Three Dials (Default: 8 / 6 / 4)
- **DESIGN_VARIANCE** (1=Symmetry to 10=Artsy Chaos)
- **MOTION_INTENSITY** (1=Static to 10=Cinematic Physics)
- **VISUAL_DENSITY** (1=Airy Gallery to 10=Cockpit Data)

## 2. Forbidden AI Tells (Zero-Tolerance Anti-Patterns)
1. **No Cliché Gradients & Backgrounds**: Ban dark mesh backgrounds with purple/cyan radial gradients.
2. **No Lazy Symmetrical Bento Grids**: Never render 3 identical cards with identical padding and copy length. Use asymmetric row/col spans determined by content priority.
3. **No 6-Line Wrapped Headlines**: Never constrain massive display typography inside narrow containers.
4. **No Invisible / Muted Button Contrast**: Action elements must have distinct, legible contrast and clear states (`:hover`, `:active`, `:focus-visible`).
5. **No Em-Dash Addiction**: Ban gratuitous em-dashes (`—`) in copy and explanations.
6. **No "Jane Doe" / "Acme Corp" Placeholders**: Use domain-authentic realistic names, figures, and data.
7. **No Gratuitous Loops**: Animations should be intentional, interactive, or scroll-driven, respecting `prefers-reduced-motion`.

## 3. Foundation & Design Systems
- Reach for established design systems when appropriate (`@radix-ui/themes`, `shadcn/ui`, `@primer/react`, `@fluentui`, `@carbon`, Material 3).
- When using Vanilla CSS or Tailwind, use curated typographic hierarchies, tailored color palettes, and balanced whitespace.
- Always support dark and light theme consistency.
