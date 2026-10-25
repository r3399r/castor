'use client'

import { useEffect, useState } from 'react'
import { Coins } from 'lucide-react'
import { formatNumber } from '@/lib/number'
import { apiFetch, apiPut } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Button, ButtonLink, ErrorState, LoadingState, PageHeader } from '@/components/ui'
import type { GetUserMeResponse, PutUserMeRequest, PutUserMeResponse } from '@/types/api'
import SubscriptionCard from './SubscriptionCard'
import styles from './user.module.css'

export default function UserClient() {
  const { logout } = useAuth()
  const [me, setMe] = useState<GetUserMeResponse | null>(null)
  const [editing, setEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<GetUserMeResponse>('user/me')
      .then((u) => {
        setMe(u)
        setNameDraft(u.name ?? '')
      })
      .catch(() => setError('無法載入使用者資料，請確認已登入。'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    const trimmed = nameDraft.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const updated = await apiPut<PutUserMeResponse, PutUserMeRequest>('user/me', { name: trimmed })
      setMe(updated)
      setNameDraft(updated.name ?? '')
      setEditing(false)
    } catch {
      alert('更新失敗，請稍後再試。')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setNameDraft(me?.name ?? '')
    setEditing(false)
  }

  if (loading) {
    return <LoadingState />
  }

  if (error || !me) {
    return (
      <ErrorState>
        <p>{error ?? '無法載入使用者資料，請確認已登入。'}</p>
        <a href="/" className={styles.loginLink}>
          回首頁登入
        </a>
      </ErrorState>
    )
  }

  const initial = (me.name ?? me.email ?? '?').charAt(0).toUpperCase()

  return (
    <div className={styles.content}>
      <PageHeader title="個人資料" />

      <div className={`${styles.card} ${styles.profileCard}`}>
        <div className="flex items-center gap-4">
          {me.avatar ? (
            <img
              src={me.avatar}
              alt={me.name ?? '使用者頭像'}
              referrerPolicy="no-referrer"
              className={styles.avatar}
            />
          ) : (
            <span className={styles.avatarFallback}>
              {initial}
            </span>
          )}
          <div className="flex flex-col gap-1">
            {editing ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={255}
                  autoFocus
                  className={styles.textInput}
                />
                <Button
                  onClick={handleSave}
                  disabled={saving || !nameDraft.trim()}
                  loading={saving}
                >
                  {saving ? '儲存中…' : '儲存'}
                </Button>
                <Button variant="quiet" onClick={handleCancel} disabled={saving}>
                  取消
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className={styles.name}>{me.name || '未設定名稱'}</h2>
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                  編輯
                </Button>
              </div>
            )}
            <span className={`${styles.muted} text-sm`}>{me.email}</span>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={logout}
        >
          登出
        </Button>
      </div>

      <SubscriptionCard />

      <div className={`${styles.card} ${styles.pointsCard}`}>
        <div className={styles.pointsInfo}>
          <span className={styles.pointsIcon}><Coins size={24} strokeWidth={1.8} /></span>
          <div className={styles.pointsCopy}>
            <p className={styles.pointsTitle}>累積積分</p>
            <p className={styles.pointsValue}>{formatNumber(me.lifetimePoints)}</p>
          </div>
        </div>
        <ButtonLink href="/user/wallet" variant="secondary">
          查看紀錄
        </ButtonLink>
      </div>
    </div>
  )
}
