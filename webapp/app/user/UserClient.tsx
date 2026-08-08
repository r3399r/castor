'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Coins } from 'lucide-react'
import { apiFetch, apiPut } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import type { GetUserMeResponse, PutUserMeRequest, PutUserMeResponse } from '@/types/api'

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
    return (
      <div className="flex h-48 items-center justify-center">
        <span className="text-sm text-black-500">載入中…</span>
      </div>
    )
  }

  if (error || !me) {
    return (
      <div className="rounded-[24px] border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm text-red-600">{error ?? '無法載入使用者資料，請確認已登入。'}</p>
        <a href="/" className="mt-4 inline-block text-sm text-blue-700 underline hover:text-[#1f3ea3]">
          回首頁登入
        </a>
      </div>
    )
  }

  const initial = (me.name ?? me.email ?? '?').charAt(0).toUpperCase()

  return (
    <div className="pb-[70px]">
      <h1 className="mt-[60px] mb-6 text-3xl font-bold text-blue-700">個人資料</h1>

      <div className="flex flex-col items-start justify-between gap-4 rounded-lg border border-brown-300 bg-white/40 p-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          {me.avatar ? (
            <img
              src={me.avatar}
              alt={me.name ?? '使用者頭像'}
              referrerPolicy="no-referrer"
              className="h-16 w-16 shrink-0 rounded-full border border-brown-300 object-cover"
            />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-brown-300 bg-blue-700/10 text-xl font-bold text-blue-700">
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
                  className="rounded-md border border-brown-300 px-2 py-1 text-base font-bold text-black-900 focus:border-blue-700 focus:outline-none"
                />
                <button
                  onClick={handleSave}
                  disabled={saving || !nameDraft.trim()}
                  className="rounded-md bg-blue-700 px-3 py-1 text-sm font-medium text-white transition hover:bg-[#1f3ea3] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? '儲存中…' : '儲存'}
                </button>
                <button onClick={handleCancel} disabled={saving} className="text-sm text-black-500 hover:text-black-700">
                  取消
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-black-900">{me.name || '未設定名稱'}</h2>
                <button onClick={() => setEditing(true)} className="text-sm text-blue-700 hover:underline">
                  編輯
                </button>
              </div>
            )}
            <span className="text-sm text-black-500">{me.email}</span>
          </div>
        </div>
        <button
          onClick={logout}
          className="rounded-md border border-brown-300 px-4 py-2 text-sm text-black-900 transition hover:bg-beige-200"
        >
          登出
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-brown-300 bg-white/40 p-6">
        <div className="flex items-center gap-3">
          <Coins size={28} strokeWidth={1.5} className="text-amber-700" />
          <div>
            <p className="text-sm text-black-500">累積積分</p>
            <p className="text-2xl font-bold text-amber-700">{me.lifetimePoints}</p>
          </div>
        </div>
        <Link href="/user/wallet" className="text-sm text-blue-700 hover:underline">
          查看紀錄
        </Link>
      </div>
    </div>
  )
}
