'use client'

import { useEffect, useState } from 'react'
import { Coins, Gift } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import type { GetUserMeResponse } from '@/types/api'

export default function BoxClient() {
  const [me, setMe] = useState<GetUserMeResponse | null>(null)

  useEffect(() => {
    apiFetch<GetUserMeResponse>('user/me')
      .then(setMe)
      .catch(console.error)
  }, [])

  return (
    <div>
      <h1 className="mt-[60px] mb-2 text-3xl font-bold text-blue-700">禮物盒</h1>
      <p className="mb-10 text-sm text-black-500">
        展示你收集到的成就與獎勵。透過練習累積積分，未來可以在這裡解鎖成就或兌換獎品。
      </p>

      <div className="mb-8 flex items-center justify-center gap-3 rounded-[24px] border border-brown-300 bg-white p-8">
        <Coins size={32} strokeWidth={1.5} className="text-amber-700" />
        <div className="text-center">
          <p className="text-sm text-black-500">目前積分</p>
          <p className="text-3xl font-bold text-amber-700">{me ? me.totalPoints : '—'}</p>
        </div>
      </div>

      <div className="rounded-[24px] border border-brown-300 bg-white p-12 text-center">
        <Gift size={40} strokeWidth={1.5} className="mx-auto mb-4 text-orange-700/70" />
        <p className="text-base font-medium text-black-900">積分兌換系統即將推出</p>
        <p className="mt-2 text-sm text-black-500">敬請期待，之後這裡會顯示你的收藏與可兌換的獎品。</p>
      </div>
    </div>
  )
}
