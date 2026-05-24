const highlights = [
  {
    icon: '/book.svg',
    title: '精選題庫',
    description:
      '涵蓋歷屆試題與高頻考點，並持續更新與優化內容，確保題庫品質與時效性，讓你能更精準掌握考試方向。',
  },
  {
    icon: '/devices.svg',
    title: '支援多平台',
    description:
      '支援網頁與行動裝置，無論使用電腦、平板或手機，都能隨時接續學習進度，靈活安排練習時間。',
  },
  {
    icon: '/ai.svg',
    title: '智慧練習',
    description:
      '依據你的作答表現，自動調整題目難度與出題方向，提供個人化練習建議，幫助你逐步強化弱點，提升整體學習效率。',
  },
  {
    icon: '/socialnetwork.svg',
    title: '社群解析',
    description: '與其他考友在社群討論疑難，共享備考心得與資源。',
  },
]

export default function HomeHighlights() {
  return (
    <section className="py-[60px] xl:py-[96px]">
      <div className="mx-auto w-full max-w-[1120px] px-4 md:px-[40px] xl:px-[70px]">
        <div className="flex flex-col gap-10 xl:flex-row xl:gap-0 xl:divide-x xl:divide-black-200">
          {/* Left: heading */}
          <div className="flex flex-col gap-5 xl:w-[340px] xl:shrink-0 xl:pr-12">
            <h2 className="text-[40px] font-bold leading-tight text-blue-700">
              讓學習
              <br />
              更有效率
            </h2>
            <p className="text-base leading-7 text-black-500">
              從題庫練習到作答分析，完整掌握你的學習進度，短時間內有感提升成績。
            </p>
          </div>

          {/* Right: 2×2 grid */}
          <div className="flex flex-col xl:flex-1 xl:pl-12">
            {/* Top row */}
            <div className="flex flex-row divide-x divide-black-200 pb-8">
              {highlights.slice(0, 2).map((item) => (
                <div key={item.title} className="flex flex-col gap-3 flex-1 pr-6 last:pr-0 last:pl-6">
                  <img src={item.icon} alt="" width={32} height={32} aria-hidden />
                  <div>
                    <h3 className="text-lg font-bold text-black-700">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-black-500">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Horizontal divider */}
            <hr className="border-black-200" />

            {/* Bottom row */}
            <div className="flex flex-row divide-x divide-black-200 pt-8">
              {highlights.slice(2, 4).map((item) => (
                <div key={item.title} className="flex flex-col gap-3 flex-1 pr-6 last:pr-0 last:pl-6">
                  <img src={item.icon} alt="" width={32} height={32} aria-hidden />
                  <div>
                    <h3 className="text-lg font-bold text-black-700">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-black-500">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
