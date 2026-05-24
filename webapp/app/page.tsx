import Footer from '@/components/Footer'
import HomeCategories from '@/components/HomeCategories'
import HomeCTA from '@/components/HomeCTA'
import HomeFeature from '@/components/HomeFeature'
import HomeHighlights from '@/components/HomeHighlights'
import HomeHero from '@/components/HomeHero'
import Navbar from '@/components/Navbar'
import HomeStatsBar from '@/components/HomeStatsBar'

export default function Home() {
  return (
    <div className="m-[10px] min-h-[calc(100vh-20px)] border border-brown-700 bg-beige-100">
        <div className="px-4 sm:px-6">
          <Navbar />
          <main>
            <HomeHero />
            <HomeStatsBar />
            <HomeCategories />
            <HomeFeature />
            <HomeHighlights />
            <HomeCTA />
            <Footer />
          </main>
        </div>
      </div>
  )
}
