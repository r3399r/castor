import Link from 'next/link'

/**
 * The closing call to action, and the only entrance on the public site
 * to either of the two pages a visitor who is not signed in can
 * actually use.
 *
 * Both links are deliberate:
 *
 *   /subscription -- prices come from the public GET /api/info/plans,
 *     so the page renders for a visitor with the button locked. That
 *     was pointless while nothing linked to it: the only ways in were
 *     the card on /user and the paywall on /analysis, which both
 *     require an account.
 *   /impact -- the donation record. A transparency page reachable only
 *     by people who already trust us enough to sign up is not evidence,
 *     which is why the page itself sits outside AuthGuard.
 *
 * Styled with Tailwind rather than sp-button because this section is
 * --color-spirit-forest (#173f3a) and sp-button--primary paints
 * --color-spirit-canopy (#234b43): two dark greens one step apart,
 * which would leave the button nearly invisible against the band.
 */
export default function HomeCTA() {
  return (
    <section className="noise -mx-4 bg-spirit-forest py-section-sm sm:-mx-6 xl:py-section-lg">
      <div className="mx-auto w-full max-w-site px-page-gutter md:px-page-gutter-md xl:px-page-gutter-lg">
        <div className="mx-auto max-w-[640px] text-center">
          <h2 className="mb-4 text-spirit-display-sm font-bold leading-tight text-spirit-on-dark">
            準備好開始了嗎？
          </h2>
          <p className="text-base leading-7 text-spirit-on-dark/85">
            現在就加入，從第一題開始累積你的學習優勢，也累積一份公益。
          </p>

          {/* Stacked and full width on a phone, side by side from 640px:
              two 中文 labels of this length overflow a narrow screen when
              forced onto one row. */}
          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/subscription"
              className="inline-flex min-h-[var(--control-height-lg)] items-center justify-center rounded-[var(--radius-spirit-control)] bg-spirit-cream px-6 py-3 text-base font-bold text-spirit-canopy transition-colors hover:bg-white"
            >
              查看訂閱方案
            </Link>
            <Link
              href="/impact"
              className="inline-flex min-h-[var(--control-height-lg)] items-center justify-center rounded-[var(--radius-spirit-control)] border border-spirit-on-dark/40 px-6 py-3 text-base font-bold text-spirit-on-dark transition-colors hover:border-spirit-on-dark hover:bg-spirit-on-dark/10"
            >
              公益徵信紀錄
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
