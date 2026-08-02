'use client'

import type { SharedFilters } from './useSharedFilters'

// Rendered once by ReplyTabsClient and shared by both the 錯題本 and 歷史紀錄
// tabs, so picking a filter applies to both lists at once instead of each
// tab needing its own separate selection.
export default function FilterPanel({ filters, disabled }: { filters: SharedFilters; disabled: boolean }) {
  const {
    selectedCategoryId,
    selectedSubjectId,
    selectedExamIds,
    selectedTagIds,
    selectedFilterOptionByDim,
    categoryList,
    filterDimensions,
    filteredSubjectList,
    visibleOptionsByDim,
    examList,
    tagList,
    hasActiveFilters,
    selectCategory,
    selectSubject,
    toggleFilterOption,
    toggleExam,
    toggleTag,
    clearFilters,
  } = filters

  return (
    <div className="mb-10 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-black-700">篩選條件</span>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            disabled={disabled}
            className="flex items-center gap-1 rounded-md border border-brown-300 px-2.5 py-1 text-sm text-black-500 transition hover:bg-beige-200 disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M11 3L3 11M3 3L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            清空篩選
          </button>
        )}
      </div>

      {/* 類別 */}
      {categoryList.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {categoryList.map((c) => (
            <button
              key={c.id}
              onClick={() => selectCategory(String(c.id))}
              disabled={disabled}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                selectedCategoryId === String(c.id)
                  ? 'border-2 border-blue-700 bg-blue-700/10 text-blue-700'
                  : 'border border-brown-300 bg-beige-200/80 text-black-900 hover:border-brown-700'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* 篩選維度（依類別而定）*/}
      {selectedCategoryId && filterDimensions.length > 0 && (
        <div className="divide-y divide-brown-300 rounded-lg border border-brown-700 bg-white/60">
          {filterDimensions.map((dim) => (
            <div key={dim.id} className="px-4 py-3">
              <span className="mb-2 block text-xs font-bold text-black-700">{dim.name}</span>
              <div className="flex flex-wrap gap-2">
                {(visibleOptionsByDim[dim.id] ?? dim.options).map((opt) => {
                  const checked = selectedFilterOptionByDim[dim.id] === opt.id
                  return (
                    <button
                      key={opt.id}
                      onClick={() => toggleFilterOption(dim.id, opt.id)}
                      disabled={disabled}
                      className={`rounded-lg px-3 py-1 text-sm font-medium transition ${
                        checked
                          ? 'border-2 border-teal-700 bg-teal-700/10 text-teal-700'
                          : 'border border-brown-300 bg-beige-200/80 text-black-900 hover:border-brown-700'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {opt.name}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 科目 */}
      {selectedCategoryId && filteredSubjectList.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filteredSubjectList.map((s) => (
            <button
              key={s.id}
              onClick={() => selectSubject(String(s.id))}
              disabled={disabled}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                selectedSubjectId === String(s.id)
                  ? 'border-2 border-green-700 bg-green-700/10 text-green-700'
                  : 'border border-brown-300 bg-beige-200/80 text-black-900 hover:border-brown-700'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* 試卷／標籤 */}
      {selectedSubjectId && (examList.length > 0 || tagList.length > 0) && (
        <div className="divide-y divide-brown-300 rounded-lg border border-brown-700 bg-white/60">
          {examList.length > 0 && (
            <div className="px-4 py-3">
              <span className="mb-2 block text-xs font-bold text-black-700">試卷（可複選）</span>
              <div className="flex flex-wrap gap-2">
                {examList.map((e) => {
                  const checked = selectedExamIds.includes(String(e.id))
                  return (
                    <button
                      key={e.id}
                      onClick={() => toggleExam(String(e.id))}
                      disabled={disabled}
                      className={`rounded-lg px-3 py-1 text-sm font-medium transition ${
                        checked
                          ? 'border-2 border-purple-700 bg-purple-700/10 text-purple-700'
                          : 'border border-brown-300 bg-beige-200/80 text-black-900 hover:border-brown-700'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {e.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {tagList.length > 0 && (
            <div className="px-4 py-3">
              <span className="mb-2 block text-xs font-bold text-black-700">標籤（可複選）</span>
              <div className="flex flex-wrap gap-2">
                {tagList.map((t) => {
                  const checked = selectedTagIds.includes(String(t.id))
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleTag(String(t.id))}
                      disabled={disabled}
                      className={`rounded-lg px-3 py-1 text-sm font-medium transition ${
                        checked
                          ? 'border-2 border-blue-700 bg-blue-700/10 text-blue-700'
                          : 'border border-brown-300 bg-beige-200/80 text-black-900 hover:border-brown-700'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {t.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
