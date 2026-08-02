'use client'

import { useState } from 'react'
import FilterPanel from './FilterPanel'
import ReplyClient from './ReplyClient'
import WrongClient from './WrongClient'
import { useSharedFilters } from './useSharedFilters'

// 錯題本 first to match the mobile app's tab order (mobile/lib/pages/reply_tabs_page.dart).
const TABS = [
  { key: 'wrong', label: '錯題本' },
  { key: 'history', label: '歷史紀錄' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function ReplyTabsClient() {
  const [activeTab, setActiveTab] = useState<TabKey>('wrong')
  const filters = useSharedFilters()

  // Both tabs fetch off of the same filters and stay mounted at once (see
  // below), so either one may be loading regardless of which is visible --
  // the filter panel disables while either is in flight.
  const [wrongLoading, setWrongLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(true)

  return (
    <div>
      <h1 className="mt-[60px] mb-6 text-3xl font-bold text-blue-700">作答記錄</h1>

      <div className="mb-8 flex border-b border-brown-300">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`border-b-2 px-6 py-3 text-sm font-medium transition ${
              activeTab === tab.key
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-black-500 hover:text-black-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Shared by both tabs so switching between them never requires
          re-selecting filters -- see useSharedFilters. */}
      <FilterPanel filters={filters} disabled={wrongLoading || historyLoading} />

      {/* Both tabs stay mounted so switching between them doesn't refetch or
          reset filters -- only the CSS visibility toggles. Since both watch
          the same filters.queryFilters, changing a filter refreshes whichever
          tab isn't currently visible too, so its data is already current
          when the user switches to it. */}
      <div className={activeTab === 'wrong' ? 'block' : 'hidden'}>
        <WrongClient filters={filters.queryFilters} onLoadingChange={setWrongLoading} />
      </div>
      <div className={activeTab === 'history' ? 'block' : 'hidden'}>
        <ReplyClient filters={filters.queryFilters} onLoadingChange={setHistoryLoading} />
      </div>
    </div>
  )
}
