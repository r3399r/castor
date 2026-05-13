import HomeCategories from '@/components/HomeCategories'
import HomeHero from '@/components/HomeHero'
import Navbar from '@/components/Navbar'
import HomeStatsBar from '@/components/HomeStatsBar'

export default function Home() {
  return (
    <div className="m-[10px] min-h-[calc(100vh-20px)] border border-brown-700 bg-beige-100">
        <div className="px-4 py-6 sm:px-6">
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
