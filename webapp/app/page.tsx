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
    <div className="min-h-screen bg-beige-100">
      <div className="standard-site-header">
        <Navbar />
      </div>
      <div className="px-4 sm:px-6">
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
