'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import type { GetInfoPlansResponse } from '@/types/api'

export type PlanAmounts = Record<string, number>

/**
 * The authoritative price per plan, keyed by plan code.
 *
 * The webapp holds no price constants: the amount shown has to be the
 * amount the server signs into the payment order, or the page advertises
 * one number and the card is charged another. `null` therefore means
 * "not known yet", and a caller must render no price and offer no
 * purchase while it is null -- not fall back to something plausible.
 *
 * Unauthenticated, because the pricing page is read before signing in.
 */
export function usePlanAmounts(): { amounts: PlanAmounts | null; failed: boolean } {
  const [amounts, setAmounts] = useState<PlanAmounts | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    apiFetch<GetInfoPlansResponse>('info/plans')
      .then((res) => {
        // A 2xx is no guarantee of the shape -- a 204 arrives here as
        // undefined -- and a malformed price is worse than no price.
        if (
          Array.isArray(res) &&
          res.every((plan) => typeof plan?.code === 'string' && typeof plan?.amount === 'number')
        )
          setAmounts(Object.fromEntries(res.map((plan) => [plan.code, plan.amount])))
        else setFailed(true)
      })
      .catch(() => setFailed(true))
  }, [])

  return { amounts, failed }
}
