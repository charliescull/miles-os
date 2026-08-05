# Desktop Visual Language v1

## Intent

The desktop Miles OS experience should feel like an interactive personal command center: expressive, spatial, data-rich, and alive. The visual layer should make progress and relationships legible without turning daily workflows into a cockpit that is difficult to use.

This is a desktop-first presentation layer. Mobile should share the same data, semantics, and brand language, but remain faster, calmer, and task-focused rather than reproducing the desktop visualizations.

## References supplied by the user

- [rndyrbrts systems reel](https://www.instagram.com/reel/DZcRoIEi4hB/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==)
- [Brody Automates data reel](https://www.instagram.com/reel/DV5DjifjdlE/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==)
- [Templation.io post](https://www.instagram.com/p/DZElF30gO2H/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==)
- [quietprogress co post](https://www.instagram.com/p/Damslv0MUrG/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==)

Instagram media should be reviewed manually or from screenshots/video attachments before implementation-specific copying. The references are inspiration, not a request to duplicate another creator's work.

## Design principles

- Build interactive systems, not decorative dashboards.
- Use motion to explain change, causality, and progress—not to add constant activity.
- Let the user move through data spatially when relationships matter: timelines, constellations, orbiting records, draggable panels, and linked entities.
- Keep the primary action obvious even inside a visually rich surface.
- Make every visualization resolve to a useful action, detail view, or explanation.
- Prefer progressive disclosure: overview first, inspection on hover/click, editing in a focused surface.
- Preserve the existing oklch token system and use red/green for meaningful negative/positive movement.
- Keep reduced-motion behavior and rendering performance as first-class constraints.

## Desktop component families

These are a future component vocabulary, to be selected by meaning rather than forced onto every page:

- **System map:** linked domain nodes for tasks, health, finance, food, wardrobe, and goals.
- **Progress radar:** multi-axis snapshots for areas such as energy, consistency, nutrition, finances, and focus. Always show the time window and source of each axis.
- **Timeline / activity stream:** a visual history of captures, completions, meals, workouts, reminders, and decisions.
- **Draggable workbench:** modular panels for assembling outfits, meals, plans, or weekly reviews.
- **Signal cards:** compact cards with directional change, cause, confidence, and next action.
- **Data theater:** controlled generative or animated views for daily/weekly summaries, used as an optional overview rather than the only interface.

## Mobile boundary

Mobile shares:

- data contracts;
- status colors and meanings;
- typography and interaction language;
- progress terminology;
- capture and action semantics.

Mobile does not inherit:

- dense multi-panel workbenches;
- large draggable canvases;
- decorative ambient animation;
- radar charts as primary navigation;
- desktop-only 3D or data-theater views.

Mobile should expose the same insight as a concise card, list, timeline, or single focused action.

## Sequencing

Do not begin this visual layer before the capture foundation, mobile command center, reminder state, and domain data contracts are reliable. Build the first visual slice after those foundations using real data from at least two domains. Recommended first slice: a desktop progress overview with a radar chart, timeline, linked domain nodes, and drill-down actions.
