'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import type { GetInfoGrowthResponse } from '@/types/api'

/**
 * The subscriber growth-bonus rate, as a whole percentage.
 *
 * The webapp holds no copy of it, for the reason it holds no prices: the
 * subscription page advertises the benefit, the box screen states the XP
 * an investment will earn before it is made, and the server grants it
 * afterwards. A rate written down here is a rate that can advertise one
 * thing while another is granted -- and the user sees both numbers.
 *
 * `null` means "not known yet". A caller must state no rate while it is
 * null rather than fall back to something plausible: falling back to a
 * plausible 10 is exactly what this hook exists to remove.
 *
 * Unauthenticated, because it is a published benefit read while deciding
 * whether to subscribe.
 */
export function useGrowthBonus(): { bonusPercent: number | null; failed: boolean } {
  const [bonusPercent, setBonusPercent] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    apiFetch<GetInfoGrowthResponse>('info/growth')
      .then((res) => {
        // A 2xx is no guarantee of the shape -- a 204 arrives here as
        // undefined -- and a malformed rate would read as 0, which is a
        // wrong benefit rather than an absent one.
        if (typeof res?.subscriberXpBonusPercent === 'number')
          setBonusPercent(res.subscriberXpBonusPercent)
        else setFailed(true)
      })
      .catch(() => setFailed(true))
  }, [])

  return { bonusPercent, failed }
}
