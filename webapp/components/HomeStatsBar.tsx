import SlotNumber from '@/components/SlotNumber'

const stats = [
  { value: '5', label: '種類別' },
  { value: '10', label: '種科目' },
  { value: '100', label: '張試卷' },
  { value: '1,000', label: '道試題' },
  { value: '300', label: '名使用者' },
]

export default function HomeStatsBar() {
  return (
    <section>

      {/* Mobile: 單欄，水平線內縮 16px，無豎線 */}
      <div className="border-y border-spirit-line md:hidden">
        <div className="flex flex-col py-10">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center py-10">
              <SlotNumber value={stat.value} />
              <p className="mt-2 text-sm text-spirit-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tablet: 上3下2，下排靠左 */}
      <div className="hidden border-y border-spirit-line md:block xl:hidden">
        <div className="flex flex-col py-10">
          <div className="flex">
            {stats.slice(0, 3).map((stat, i) => (
              <div
                key={stat.label}
                className={`flex w-1/3 flex-col items-center justify-center py-4${i > 0 ? ' border-l border-spirit-line' : ''}`}
              >
                <SlotNumber value={stat.value} />
                <p className="mt-2 text-sm text-spirit-muted">{stat.label}</p>
              </div>
            ))}
          </div>
          <div className="flex">
            {stats.slice(3).map((stat, i) => (
              <div
                key={stat.label}
                className={`flex w-1/3 flex-col items-center justify-center py-4${i === 1 ? ' border-x border-spirit-line' : ''}`}
              >
                <SlotNumber value={stat.value} />
                <p className="mt-2 text-sm text-spirit-muted">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop: 單排 5 欄 */}
      <div className="hidden border-y border-spirit-line xl:block">
        <div className="flex justify-center py-10">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className={`flex w-[196px] flex-col items-center justify-center border-l border-spirit-line py-4${i === stats.length - 1 ? ' border-r' : ''}`}
            >
              <SlotNumber value={stat.value} />
              <p className="mt-2 text-sm text-spirit-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

    </section>
  )
}
