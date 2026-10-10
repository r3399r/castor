'use client'

import type { SharedFilters } from './useSharedFilters'
import styles from './reply.module.css'

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
    <div className={styles.filterPanel}>
      <div className={styles.filterHeader}>
        <span className={styles.filterTitle}>篩選條件</span>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            disabled={disabled}
            className={styles.quietButton}
          >
            <svg className="icon-sm" width="16" height="16" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M11 3L3 11M3 3L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            清空篩選
          </button>
        )}
      </div>

      {/* 類別 */}
      {categoryList.length > 0 && (
        <div className={styles.filterOptions}>
          {categoryList.map((c) => (
            <button
              key={c.id}
              onClick={() => selectCategory(String(c.id))}
              disabled={disabled}
              className={`${styles.filterOption} ${styles.categoryTone} ${
                selectedCategoryId === String(c.id) ? styles.filterOptionSelected : ''
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* 篩選維度（依類別而定）*/}
      {selectedCategoryId && filterDimensions.length > 0 && (
        <div className={styles.filterGroup}>
          {filterDimensions.map((dim) => (
            <div key={dim.id} className={styles.filterGroupRow}>
              <span className={styles.filterLabel}>{dim.name}</span>
              <div className={styles.filterOptions}>
                {(visibleOptionsByDim[dim.id] ?? dim.options).map((opt) => {
                  const checked = selectedFilterOptionByDim[dim.id] === opt.id
                  return (
                    <button
                      key={opt.id}
                      onClick={() => toggleFilterOption(dim.id, opt.id)}
                      disabled={disabled}
                      className={`${styles.filterOption} ${styles.dimensionTone} ${checked ? styles.filterOptionSelected : ''}`}
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
        <div className={styles.filterOptions}>
          {filteredSubjectList.map((s) => (
            <button
              key={s.id}
              onClick={() => selectSubject(String(s.id))}
              disabled={disabled}
              className={`${styles.filterOption} ${styles.subjectTone} ${
                selectedSubjectId === String(s.id) ? styles.filterOptionSelected : ''
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* 試卷／標籤 */}
      {selectedSubjectId && (examList.length > 0 || tagList.length > 0) && (
        <div className={styles.filterGroup}>
          {examList.length > 0 && (
            <div className={styles.filterGroupRow}>
              <span className={styles.filterLabel}>試卷（可複選）</span>
              <div className={styles.filterOptions}>
                {examList.map((e) => {
                  const checked = selectedExamIds.includes(String(e.id))
                  return (
                    <button
                      key={e.id}
                      onClick={() => toggleExam(String(e.id))}
                      disabled={disabled}
                      className={`${styles.filterOption} ${styles.examTone} ${checked ? styles.filterOptionSelected : ''}`}
                    >
                      {e.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {tagList.length > 0 && (
            <div className={styles.filterGroupRow}>
              <span className={styles.filterLabel}>標籤（可複選）</span>
              <div className={styles.filterOptions}>
                {tagList.map((t) => {
                  const checked = selectedTagIds.includes(String(t.id))
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleTag(String(t.id))}
                      disabled={disabled}
                      className={`${styles.filterOption} ${styles.tagTone} ${checked ? styles.filterOptionSelected : ''}`}
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
