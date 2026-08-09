const features = [
  {
    icon: '/bulb.svg',
    title: '觀念分類分析',
    description: '依據題目觀念分類整理，建立系統化學習架構',
  },
  {
    icon: '/proficiency.svg',
    title: '熟悉度等級',
    description: '以 1-10 等級呈現掌握度，清楚辨識強弱分布',
  },
  {
    icon: '/practice.svg',
    title: '智慧練習串聯',
    description: '自動補強弱項觀念，提升學習效率',
  },
]

export default function HomeFeature() {
  return (
    <section className="-mx-4 bg-beige-200 py-[60px] sm:-mx-6 xl:py-[96px]">
      <div className="mx-auto w-full max-w-[1120px] px-4 md:px-[40px] xl:px-[70px]">
        <header className="mx-auto max-w-[720px] space-y-4 text-center">
          <h2 className="text-[40px] font-bold leading-tight text-black-700">
            掌握每個觀念的學習狀態
          </h2>
          <p className="text-base leading-7 text-black-500">
            每次作答後，系統都會自動分析，為你找出需要加強的觀念。
          </p>
        </header>

        <div className="mt-10 grid grid-cols-1 gap-10 xl:mt-16 xl:grid-cols-2 xl:items-center xl:gap-12">
          <div className="flex justify-center">
            <img
              src="/pic-charts.png"
              alt="觀念熟悉度分析示意圖"
              className="w-full max-w-[480px]"
            />
          </div>

          <ul className="divide-y divide-black-200">
            {features.map((feature) => (
              <li key={feature.title} className="pb-6 pt-9 first:pt-0 last:pb-0">
                <div className="flex items-start gap-5">
                  <img
                    src={feature.icon}
                    alt=""
                    width={48}
                    height={48}
                    className="shrink-0"
                    aria-hidden
                  />
                  <div>
                    <h3 className="text-xl font-bold text-black-700">{feature.title}</h3>
                    <p className="text-base leading-7 text-black-500">{feature.description}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
