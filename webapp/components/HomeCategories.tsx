const categories = [
  {
    title: '高等考試',
    color: 'bg-spirit-paper',
    items: ['114年考古題', '113年模擬試卷', '110年重點整理', '常考題型', '限時練習'],
  },
  {
    title: '高中數學',
    color: 'bg-[#f6edcf]',
    items: ['114年考古題', '113年歷屆試題', '公式速記', '圖形選擇題', '證明題練習'],
  },
  {
    title: '高中英文',
    color: 'bg-[#e4ecda]',
    items: ['114年會考題', '113年指考題', '閱讀測驗', '文法填空', '聽力模擬'],
  },
]

export default function HomeCategories() {
  return (
    <section className="py-[60px] xl:py-24">
      <div className="mx-auto w-full max-w-[1120px] space-y-8 px-4 xl:px-[46px]">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-bold tracking-[0.12em] text-spirit-leaf uppercase">熱門分類</p>
          <h2 className="text-[40px] font-bold text-spirit-canopy">熱門考試 / 科目</h2>
        </div>
        <a
          href="/question"
          className="relative self-end inline-flex items-center gap-2 px-1 py-2 text-sm font-bold text-spirit-muted transition-colors after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-spirit-teal after:transition-[width] after:duration-300 hover:text-spirit-teal hover:after:w-full"
        >
          <span>看全部科目</span>
          <span aria-hidden="true">→</span>
        </a>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => (
          <article key={category.title} className={`${category.color} rounded-spirit-card border-2 border-spirit-leaf shadow-spirit-card transition-all duration-300 hover:-translate-y-2 hover:shadow-spirit-float`}>
            <div className="m-[10px] rounded-spirit-control border border-spirit-line p-4">
              <h3 className="text-[28px] font-bold text-spirit-canopy">{category.title}</h3>
              <hr className="my-4 border-spirit-line" />
              <div>
                {category.items.map((item) => (
                  <div
                    key={item}
                    className="flex items-center justify-between border-b border-spirit-line px-1 py-2"
                  >
                    <span className="text-base text-spirit-ink">{item}</span>
                    <div className="flex items-center gap-3">
                      <button className="rounded-[6px] border border-spirit-line bg-spirit-paper/55 px-3 py-1.5 text-sm text-spirit-forest transition-colors hover:bg-spirit-mist active:bg-spirit-line">題庫</button>
                      <button className="rounded-[6px] border border-spirit-line bg-spirit-paper/55 px-3 py-1.5 text-sm text-spirit-forest transition-colors hover:bg-spirit-mist active:bg-spirit-line">練習</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <a
                  href="/question"
                  className="inline-flex items-center gap-2 px-1 py-2 text-sm font-bold text-spirit-muted transition-colors hover:text-spirit-teal"
                >
                  更多
                  <span aria-hidden="true">→</span>
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>
      </div>
    </section>
  )
}
