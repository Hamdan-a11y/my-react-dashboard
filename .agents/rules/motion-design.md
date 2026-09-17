# Motion Design Guidelines (LottieFiles Motion Directive)

Applies emotional intent, physics, and choreography to all interface animations, state transitions, and micro-interactions.

## 1. The Three Pillars
- **Emotional Intent**: Define the feeling (joy, calm, urgency, confidence, trust) before selecting any technical easing or timing.
- **Visual Narrative**: Respect Setup (20-30%) → Action (30-40%) → Resolution (30-40%) even in short micro-interactions.
- **Motion Craft & Layers**:
  - Primary (100% amplitude): The hero element the user follows.
  - Secondary (30-50% amplitude, offset 50-100ms): Shadows, icons, border highlights.
  - Ambient (10-20% amplitude): Gentle continuous background life (subtle gradient shifts, breathing).

## 2. Motion Personality Archetypes
Pick ONE archetype per project / surface:
- **Playful**: 150-300ms, `ease-out-back`, 10-20% overshoot.
- **Premium**: 350-600ms, `cubic-bezier(0.4, 0, 0.2, 1)`, 0% overshoot.
- **Corporate**: 200-400ms, `cubic-bezier(0.2, 0, 0, 1)`, 0-3% overshoot.
- **Energetic**: 100-250ms, `ease-out-expo`, 15-30% overshoot.

## 3. Directional & Material Easing Rules
- **Entrance**: Decelerate (`ease-out` family). Entrances are 30-50% longer than exits.
- **Exit**: Accelerate (`ease-in` family). Fast departure, no lingered exits.
- **On-Screen**: `ease-in-out` / standard cubic-bezier.
- **Linear ban**: NEVER use linear easing for spatial translation or scaling. Linear is only permitted for continuous spinners and progress meters.

## 4. Choreography & Restraint
- **1/3 Screen Rule**: No element moves >1/3 of the screen distance without an intermediate keyframe/direction change.
- **1/3 Element Rule**: With 3+ elements, max 1/3 in active motion simultaneously.
- **Stagger Budget**: Total staggered entry across a list or bento grid must never exceed 500ms (20-50ms per item).
- **Accessibility**: Always respect `@media (prefers-reduced-motion: reduce)` by bypassing spatial movement in favor of instant or simple opacity fades.
