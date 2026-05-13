export default function HomeHero() {
  return (
    <section className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="space-y-8">
        <div className="max-w-2xl space-y-4">
          <p className="text-sm font-bold tracking-[0.12em] text-blue-700 uppercase">
            一站式學習平台
          </p>
          <h1 className="text-4xl font-bold text-blue-700 sm:text-5xl lg:text-6xl">
            考試題庫與練習平台
          </h1>
          <p className="max-w-xl text-base leading-7 text-black-700 sm:text-lg">
            涵蓋高中／大學／公職／證照考試，透過智慧出題與個人化練習，幫助你精準掌握重點，穩定提升解題能力與每一次考試表現。
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <a
            href="/question"
            className="inline-flex items-center justify-center rounded-md bg-blue-700 px-8 py-3 text-base font-bold text-white transition hover:bg-[#1f3ea3]"
          >
            開始練習
          </a>
          <a
            href="/question"
            className="inline-flex items-center justify-center rounded-md border border-brown-300 bg-white px-8 py-3 text-base font-bold text-black-900 transition hover:bg-beige-200"
          >
            瀏覽題庫
          </a>
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-[540px]">
        <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-beige-100 via-[#F9EFE2] to-[#F7E8D4] p-6 shadow-[0_24px_80px_rgba(37,71,177,0.08)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,71,177,0.15),transparent_26%)]" />
          <div className="absolute top-6 -left-10 h-40 w-40 rounded-full bg-blue-700/10 blur-3xl" />
          <div className="absolute right-0 bottom-10 h-28 w-28 rounded-full border border-blue-700/20 bg-blue-700/5" />

          <div className="relative grid gap-4 sm:grid-cols-2">
            <div className="rounded-[28px] bg-white/85 p-5 shadow-sm backdrop-blur-sm">
              <p className="text-sm font-bold tracking-[0.15em] text-blue-700 uppercase">
                智慧出題
              </p>
              <p className="mt-4 text-lg font-bold text-black-900">立即練習，更快找到弱點</p>
              <p className="mt-2 text-sm leading-6 text-black-500">
                系統會根據你的答題表現，自動調整題目難度與練習內容。
              </p>
            </div>

            <div className="rounded-[28px] bg-blue-700/10 p-5">
              <div className="mb-4 h-12 w-12 rounded-2xl bg-blue-700/20" />
              <p className="text-lg font-bold text-blue-700">個人化分析</p>
              <p className="mt-2 text-sm leading-6 text-black-500">
                了解每題答題歷程，強化學習方向與準備策略。
              </p>
            </div>
          </div>

          <div className="relative mt-6 h-[240px] overflow-hidden rounded-[32px] border border-white/70 bg-white/70">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,71,177,0.12),transparent_35%)]" />
            <div className="absolute top-10 -left-5 h-24 w-24 rounded-full bg-[#F7E8D4]" />
            <div className="absolute right-6 bottom-6 h-24 w-24 rounded-full bg-[#F9EFE2]" />
            <div className="relative flex h-full flex-col justify-between p-6">
              <div className="space-y-3">
                <div className="h-2.5 w-24 rounded-full bg-[#D6E4F7]" />
                <div className="h-2.5 w-16 rounded-full bg-[#D6E4F7]" />
                <div className="mt-6 h-16 rounded-[24px] bg-blue-700/10" />
              </div>
              <div className="flex flex-wrap gap-3">
                <span className="rounded-full bg-blue-700/10 px-3 py-1 text-xs font-bold text-blue-700">
                  快速題庫
                </span>
                <span className="rounded-full bg-[#F7E8D4] px-3 py-1 text-xs font-bold text-black-500">
                  智慧推薦
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
