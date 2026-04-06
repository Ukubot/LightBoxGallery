# Product Image Gallery

A responsive product image gallery with lightbox. No libraries or dependencies, just TypeScript compiled down to plain JavaScript.


## Running it

### Online:
index.html should be runnable straight from this same git repo: https://raw.githack.com/Ukubot/LightBoxGallery/refs/heads/main/index.html
### Locally:
Run `npm install` to get TypeScript, then `npx tsc` to compile, then open `index.html`.

---

## How it works
#### On mobile: prev/next arrows to cycle through images.
#### On desktop: thumbnails appear below and clicking the main image opens a lightbox. 
The switch between the two modes is driven by `matchMedia()` at 768px, which is configurable.
Note: the lightbox trigger button is `display: none` on mobile, not just hidden. That removes it from the accessibility tree entirely, so keyboard users on mobile never tab onto a button that doesn't do anything.

---
<img width="513" height="504" alt="image" src="https://github.com/user-attachments/assets/d7a18327-82d7-4c65-86a7-50b086ca9376" />
<img width="626" height="636" alt="image" src="https://github.com/user-attachments/assets/d6b871cc-cc35-4ad7-a8d4-4f125a5b5013" />
<img width="841" height="1100" alt="image" src="https://github.com/user-attachments/assets/678ac053-e321-4503-898a-1047ae0e9366" />

---

## Accessibility

This was treated as a proper requirement, not a checkbox. A few things that are easy to miss:

**Keyboard** - Arrow keys navigate images inside the lightbox, Escape closes it, and Tab is fully trapped inside the dialog so you can't accidentally tab onto the page behind it.

**Focus** - Opening the lightbox moves focus to the close button. Closing it returns focus to wherever you came from.

**Screen readers** - There's an off-screen live region that announces things like "Image 2 of 4" every time you navigate. It uses `requestAnimationFrame` to delay the announcement slightly, otherwise some screen readers skip it if the DOM hasn't settled yet. Thumbnail images have empty `alt` and `aria-hidden` since the button wrapping them already has a label — announcing both would be redundant.

**Reduced motion** - Transitions are turned off via `prefers-reduced-motion`.

---

## Images

Each image has a `full` version (used in the main view and lightbox) and a `thumb` (used in the thumbnail strip). The first thumbnail loads immediately, the rest are lazy. When you navigate, the next and previous images are quietly preloaded in the background so they feel instant.

---

## A few architectural choices

- **Custom element** — The gallery is a `<product-gallery>` tag. The browser calls `connectedCallback` when it appears in the DOM and `disconnectedCallback` when it's removed, so there's no manual setup or teardown needed.

- **Single AbortController** — All event listeners share one controller. Cleanup is one `controller.abort()` call.

- **CSS custom properties** — Colors, sizes, radii, and z-index are all exposed as `--gallery-*` variables so you can theme it without touching the source.

- **BEM class names** — Internal elements use `gallery__*` naming to avoid conflicts with whatever CSS is on the page. `isolation: isolate` on the root keeps z-index contained.

---

## If this were a production component

**Images** are the biggest gap. Right now it serves one size to every screen. In production you'd want `srcset`/`sizes` or a `<picture>` element, WebP/AVIF format negotiation, and ideally a CDN that handles resizing so you're not manually maintaining separate thumbnail files. A loading skeleton or LQIP would also help — there's currently no visual feedback while images load.

**The focus trap** is hand-rolled and handles the common cases, but a production component would use something like the `focus-trap` library to cover edge cases like shadow DOM or dynamically injected content.

**Testing** — there are none. For production you'd want unit tests on the state logic and Playwright tests for keyboard and screen reader behaviour, plus visual regression tests for the responsive breakpoints.

**Framework integration** — the component builds DOM with `createElement` calls, which works fine standalone but would be awkward inside a React or Vue app. In that context you'd rewrite it as a native framework component to get SSR, hydration, and the framework's own lifecycle for free.
