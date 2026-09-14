# Castor UI redesign handoff

## Current scope

- Active branch: `feat/gift-box-redesign`.
- The first completed redesign sample is the gift box page at `/box`.
- Keep this work frontend-only. Do not change APIs, backend calculations, authentication, permissions, routes, question data, or statistics logic while refining the UI.
- Do not merge this branch into `main` unless the user explicitly asks.
- The next site pages will eventually adopt the same visual system, but currently only shared foundations and `/box` are in scope.

## Product concept

The site is a mature learning product set in a warm fantasy world where learning energy nurtures spirits. The interface must remain clear and comfortable for long study sessions while the surrounding presentation supplies growth, collection, and game-world atmosphere.

The illustration direction comes from the existing deer and bird cards: flat acrylic or opaque gouache, deep teal forest tones, glassy blue-green, leaf green, warm gold, cream, and restrained coral accents. Avoid a childish game appearance, generic SaaS cards with pasted-on illustrations, dense decoration behind text, and strong dark shadows.

## Shared design system

- Tokens: `webapp/styles/tokens.css`
- Shared UI styles: `webapp/styles/spirit.css`
- `/box` route-specific layout and hero styles: `webapp/styles/box-hero.css`
- Shared UI components: `webapp/components/ui/index.tsx`
- Shared spirit components: `webapp/components/spirit/index.tsx`
- Spirit catalog and image lookup: `webapp/lib/guardianArtwork.ts`

The shared system includes colors, typography, spacing, radii, shadows, surfaces, borders, interaction states, and responsive breakpoints. Reuse these foundations on later pages. Keep question, answer, form, table, and data areas visually clean.

## `/box` page state

- The header is transparent and absolutely positioned only on `/box`; all other pages retain the solid dark-green header.
- The hero uses `/images/spirit-garden-hero.webp` first, with `/images/spirit-garden-hero.png` retained as the original asset.
- The hero background uses `cover` and `center bottom`; it preserves the lower vine, leaves, eggs, and flowers.
- The page background continues from deep teal into a warmer, slightly orange cream tone.
- The points display is a compact parchment-style game plaque using independent vine decorations.
- The three tabs are independent dark teal capsules with accessible tab semantics and responsive sizes.
- The cultivation view uses one unified panel: dark forest spirit display on the left and warm cream controls on the right. It stacks as one connected panel on mobile.
- The current spirit artwork is upright. Its caption is displayed as `— LV2 —` using CSS decorative lines.
- The growth summary shows LV1-LV5. Future stages use the shared locked egg and do not load unreleased character artwork.
- The collection modal retains its title, category, image, and close control. The temporary explanatory sentence below the image has been removed.
- The public-support panel states that completing LV5 triggers a platform contribution and highlights `NT$10`; it does not implement contribution logic.

## Spirit categories

| Public-interest category | Spirit | Artwork status | Store egg name |
| --- | --- | --- | --- |
| 兒少、家庭與婦幼 | 貓 | Pending | 暖陽之蛋 |
| 身心障礙與神經發展 | 水獺 | Pending | 星光之蛋 |
| 高齡長照與失智照護 | 狗 | Pending | 長青之蛋 |
| 疾病醫療、心理與善終 | 兔子 | Pending | 療癒之蛋 |
| 人權、法治、性別與社區 | 海豚 | Pending | 共鳴之蛋 |
| 教育翻轉、人文與藝術 | 鳥 | LV1-LV5 available | 智慧之蛋 |
| 生態環境與動物福利 | 鹿 | LV1-LV5 available | 森林之蛋 |

The collection always displays all seven categories. Categories already redeemed or in progress are sorted first; locked categories remain visible after them. The store also displays the same seven categories in the table order. Until the other five art sets exist, their store and locked collection states use the shared egg asset rather than substitute character art.

## Assets

- Deer cards: `webapp/public/illustrations/guardians/deer/lv1.png` through `lv5.png`
- Bird cards: `webapp/public/illustrations/guardians/bird/lv1.png` through `lv5.png`
- Locked egg: `webapp/public/images/locked-egg.png`
- Hero: `webapp/public/images/spirit-garden-hero.png` and `.webp`
- Points vines: `webapp/public/images/points-vine-top-left.png` and `points-vine-bottom-right.png`

Future character images must remain data-driven and replaceable. Do not hard-code the page to deer or bird.

## Responsive and accessibility requirements

- Preserve desktop, tablet, and mobile layouts without horizontal scrolling, image distortion, clipped text, or blocked controls.
- Decorative layers use `pointer-events: none` and remain below interactive UI.
- Keep visible keyboard focus, ARIA tab semantics, and full clickable controls.
- Support `prefers-reduced-motion` for optional motion.
- Locked eggs use `object-fit: contain` and never reveal future character images.

## Validation

For scoped UI changes, run:

```bash
node_modules/.bin/tsc -p webapp/tsconfig.json --noEmit --incremental false
git diff --check
```

The repository's configured lint command is currently not reliable, so do not report full lint success unless the project lint setup is repaired and actually runs non-interactively.

## Temporary preview

The shareable demo is built outside the repository in `/private/tmp/castor-box-review`. It uses a demo authentication fixture and does not call or modify the production backend. A Cloudflare Quick Tunnel URL is temporary and may disappear if the computer sleeps, the network changes, or the tunnel process stops. Rebuild the fixture after UI edits before reviewing it.

## Removed documentation

The previous `docs/ui/gift-box-redesign` directory contained screenshots and check artifacts only. It was removed because it was not required by the running application. Do not recreate large screenshot archives inside the repository unless the user asks for them.
