import { BarChart3, NotebookPen, Sparkles, Zap } from 'lucide-react'

/**
 * What paid access includes, as a flat list.
 *
 * Its own module because two screens show it and they must not disagree:
 * the plan page lists it as "訂閱包含", and the beta notice that replaces
 * that page lists the same four as what beta opens for free. A copy in
 * each would let beta advertise a feature the paywall no longer covers,
 * or miss one it does.
 *
 * Not in `lib/subscription.ts`: that module is deliberately free of
 * presentation, and these entries carry icons.
 */
export const benefitSummary = [
  { label: '完整進階學習分析', icon: BarChart3 },
  { label: '錯題筆記', icon: NotebookPen },
  { label: '訂閱限定精靈', icon: Sparkles },
  { label: '精靈培養 XP 加成', icon: Zap },
] as const
