'use client'

import { useSearchParams } from 'next/navigation'
import { DonationFlowClient as DemoFlowClient } from '../DonationDemo'
import { DonationFlowClient as RealFlowClient } from '../DonationFlow'

/**
 * Picks the real flow or the localStorage design demo.
 *
 * Split at the route rather than inside one component: the demo's state
 * lives in localStorage and its organisations are fictional, so letting
 * the two share a component is how a demo figure ends up rendered as a
 * real promise. `?demo=donation` is the only way into the demo, and the
 * real flow needs no flag.
 */
export default function DonationRouteClient() {
  const params = useSearchParams()
  return params.get('demo') === 'donation' ? <DemoFlowClient /> : <RealFlowClient />
}
