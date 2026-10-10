export default function HomeCTA() {
  return (
    <section className="noise -mx-4 bg-spirit-forest py-[48px] sm:-mx-6 xl:py-[72px]">
      <div className="mx-auto w-full max-w-[1120px] px-4 md:px-[40px] xl:px-[70px]">
        <div className="mx-auto max-w-[640px] text-center">
          <h2 className="mb-4 text-[40px] font-bold leading-tight text-spirit-on-dark">
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
