export default function HomeHero() {
  return (
    <section className="py-[60px]">
      <div className="mx-auto w-full max-w-[1120px] grid items-center gap-10 px-4 lg:grid-cols-2 lg:px-[46px]">
      <div className="space-y-8">
        <div className="max-w-2xl space-y-4">
          <p className="text-sm font-bold tracking-[0.12em] text-blue-700 uppercase">
            PMP - Practice Makes Perfect
          </p>
          <h1 className="text-[40px] font-bold text-blue-700 sm:text-5xl lg:text-6xl">
            個人化智慧題庫
          </h1>
          <p className="max-w-xl text-base leading-7 text-black-700 sm:text-lg">
            涵蓋高中／大學／公職／證照考試，透過智慧出題與個人化練習，幫助你精準掌握重點，穩定提升解題能力與每一次考試表現。
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <a
            href="/question"
            className="inline-flex items-center justify-center rounded-md bg-blue-700 px-8 py-3 text-base text-white transition hover:bg-[#1f3ea3]"
          >
            開始練習
          </a>
          <a
            href="/question"
            className="inline-flex items-center justify-center rounded-md border border-brown-300 px-8 py-3 text-base text-black-900 transition hover:bg-beige-200"
          >
            瀏覽題庫
          </a>
        </div>
      </div>

      <div className="order-first flex items-center justify-center lg:order-last">
        <img src="/hero.svg" alt="hero" className="w-full max-w-[540px]" />
      </div>
      </div>
    </section>
  )
}
