export default function HomeCTA() {
  return (
    <section className="noise -mx-4 bg-blue-700 py-[48px] sm:-mx-6 xl:py-[72px]">
      <div className="mx-auto w-full max-w-[1120px] px-4 md:px-[40px] xl:px-[70px]">
        <div className="mx-auto max-w-[640px] text-center">
          <h2 className="mb-4 text-[40px] font-bold leading-tight text-beige-100">
            準備好開始了嗎？
          </h2>
          <p className="mb-10 text-base leading-7 text-blue-100">
            現在就加入，從第一題開始累積你的學習優勢。
          </p>
          <div>
            <a
              href="/question"
              className="inline-flex items-center justify-center rounded-md bg-white px-8 py-3 text-base font-medium text-blue-700 transition hover:bg-blue-50"
            >
              立刻開始
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
