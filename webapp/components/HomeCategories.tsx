const categories = [
  {
    title: '高等考試',
    color: 'bg-[#D6E4F7]',
    items: ['114年考古題', '113年模擬試卷', '110年重點整理', '常考題型', '限時練習'],
  },
  {
    title: '高中數學',
    color: 'bg-[#FAE3C6]',
    items: ['114年考古題', '113年歷屆試題', '公式速記', '圖形選擇題', '證明題練習'],
  },
  {
    title: '高中英文',
    color: 'bg-[#E6ECB8]',
    items: ['114年會考題', '113年指考題', '閱讀測驗', '文法填空', '聽力模擬'],
  },
]

export default function HomeCategories() {
  return (
    <section className="space-y-8 py-[60px] md:px-4 xl:px-[46px] xl:py-24">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-bold tracking-[0.12em] text-blue-700 uppercase">熱門分類</p>
          <h2 className="text-3xl font-bold text-blue-700 sm:text-4xl">熱門考試 / 科目</h2>
        </div>
        <a
          href="/question"
          className="relative self-end inline-flex items-center gap-2 px-1 py-2 text-sm font-bold text-black-500 transition-colors after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-black-700 after:transition-[width] after:duration-300 hover:text-black-700 hover:after:w-full"
        >
          <span>看全部科目</span>
          <span aria-hidden="true">→</span>
        </a>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => (
          <article key={category.title} className={`${category.color} rounded-2xl p-6 shadow-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-xl`}>
            <h3 className="text-[28px] font-bold text-black-700">{category.title}</h3>
            <div className="mt-6 space-y-3">
              {category.items.map((item) => (
                <div
                  key={item}
                  className="flex items-center justify-between border-b border-black-200 py-2"
                >
                  <a href="/question" className="block w-full text-base text-black-700 transition-colors hover:text-blue-700">
                    {item}
                  </a>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <a
                href="/question"
                className="inline-flex items-center gap-2 px-1 py-2 text-sm font-bold text-black-500 transition-colors hover:text-black-700"
              >
                更多
                <span aria-hidden="true">→</span>
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
