const stats = [
  { value: '5', label: '種類別' },
  { value: '10', label: '種科目' },
  { value: '100', label: '張試卷' },
  { value: '1,000', label: '道試題' },
  { value: '300', label: '名使用者' },
]

export default function HomeStatsBar() {
  return (
    <section className="rounded-[32px] border border-brown-700 bg-beige-100 p-4 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex min-h-[130px] flex-col items-start justify-center rounded-[28px] border border-brown-700 bg-white p-5"
          >
            <p className="text-[42px] leading-none font-bold text-blue-700 sm:text-[48px]">
              {stat.value}
            </p>
            <p className="mt-2 text-sm text-black-500">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
