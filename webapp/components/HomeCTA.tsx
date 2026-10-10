export default function HomeCTA() {
  return (
    <section className="noise -mx-4 bg-spirit-forest py-section-sm sm:-mx-6 xl:py-section-lg">
      <div className="mx-auto w-full max-w-site px-page-gutter md:px-page-gutter-md xl:px-page-gutter-lg">
        <div className="mx-auto max-w-[640px] text-center">
          <h2 className="mb-4 text-spirit-display-sm font-bold leading-tight text-spirit-on-dark">
            準備好開始了嗎？
          </h2>
          <p className="mb-10 text-base leading-7 text-spirit-on-dark/85">
            現在就加入，從第一題開始累積你的學習優勢。
          </p>
          <div>
            <a
              href="/question"
              className="inline-flex items-center justify-center rounded-md bg-spirit-gold px-8 py-3 text-base font-medium text-spirit-deep transition hover:bg-spirit-gold-hover"
            >
              立刻開始
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
