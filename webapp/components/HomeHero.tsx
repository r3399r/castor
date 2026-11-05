import HomeHeroMotion from "@/components/HomeHeroMotion"

export default function HomeHero() {
  return (
    <section className="py-section-md">
      <div className="mx-auto grid w-full max-w-site items-center gap-10 px-page-gutter lg:grid-cols-2 lg:px-12">
        <div className="max-w-2xl space-y-4">
          {/*
            No `uppercase` here: the brand is written "Learn for Good"
            everywhere else, and the utility was repainting it as
            "LEARN FOR GOOD". The letterspacing still gives the eyebrow
            its treatment without re-casing a name.
          */}
          <p className="text-sm font-bold tracking-[0.12em] text-spirit-leaf">
            學益 - Learn for Good
          </p>
          <h1 className="text-spirit-display-sm font-bold text-spirit-canopy sm:text-5xl lg:text-6xl">
            個人化智慧題庫
          </h1>
          <p className="max-w-xl text-base leading-7 text-spirit-muted sm:text-lg">
            涵蓋高中／大學／公職／證照考試，以智慧出題與個人化練習，幫你精準掌握重點、穩定提升成績。練習累積的積分可以培育精靈，當牠成長到最後一階，平台就會提撥款項支持牠代表的公益主題——你的努力，不只屬於自己。
          </p>
        </div>

        <div className="order-first flex items-center justify-center lg:order-last">
          <HomeHeroMotion />
        </div>
      </div>
    </section>
  )
}
