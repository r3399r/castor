'use client'

import { Gift } from 'lucide-react'

export default function BoxClient() {
  return (
    <div>
      <h1 className="mt-[60px] mb-2 text-3xl font-bold text-blue-700">禮物盒</h1>
      <p className="mb-10 text-sm text-black-500">
        展示你收集到的成就與獎勵。未來會導入積分系統，你可以透過練習累積積分，在這裡解鎖成就或兌換獎品。
      </p>

      <div className="rounded-[24px] border border-brown-300 bg-white p-12 text-center">
        <Gift size={40} strokeWidth={1.5} className="mx-auto mb-4 text-orange-700/70" />
        <p className="text-base font-medium text-black-900">積分與兌換系統即將推出</p>
        <p className="mt-2 text-sm text-black-500">敬請期待，之後這裡會顯示你的收藏與可兌換的獎品。</p>
      </div>
    </div>
  )
}
