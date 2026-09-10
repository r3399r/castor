# Desktop Hero 560px

Only webapp/styles/box-hero.css desktop height token changed from 700px to 560px. Tablet (560px) and mobile (520px) retain their own rules. Background assets unchanged; cover / center bottom, no scaling transform or negative margins. Existing dark teal blend and page gradient retained.

Verified 1440×1000, 834×1112, 390×844, three tabs, responsive menus, no horizontal overflow. TypeScript, scoped ESLint (temporary config), diff check passed. Screenshots use actual components with isolated auth fixture.

Pending design tradeoff: at 1440px wide, existing card bottom is approximately 278px, so a 560px Hero leaves approximately 282px below the card. Moving it down to leave 60–80px would cover bottom-right illustration. Kept its existing position pending user preference.
