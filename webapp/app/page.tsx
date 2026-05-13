import HomeCategories from '@/components/HomeCategories'
import HomeHero from '@/components/HomeHero'
import Navbar from '@/components/Navbar'
import HomeStatsBar from '@/components/HomeStatsBar'

export default function Home() {
  return (
    <div className="min-h-screen bg-beige-100 py-6">
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <Navbar />
        <main className="mt-10 space-y-16">
          <HomeHero />
          <HomeStatsBar />
          <HomeCategories />
        </main>
      </div>
    </div>
  )
}
