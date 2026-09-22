# @ldk-server-manager/ui

Svelte 5 component library extracted 1-to-1 from the "LDK Server UI" design.
`styles/tokens.css` holds the design tokens (light + `body.dark`), fonts and keyframes;
each component keeps the exact sizes, paddings and colors of its counterpart in the design.

The library knows nothing about ldk-server. Pages in `apps/web` compose these primitives.
