'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, BellRing, Check, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/db/supabase/client'
import { cn } from '@/lib/utils/cn'

export type NotificationType = 'billing' | 'project' | 'system'

export type Notification = {
  id: string
  title: string
  message: string | null
  type: NotificationType
  is_read: boolean
  created_at: string
}

const TYPE_LABEL: Record<NotificationType, string> = {
  billing: '請求',
  project: 'プロジェクト',
  system: 'システム',
}

const TYPE_BADGE_CLASS: Record<NotificationType, string> = {
  billing: 'bg-amber-50 text-amber-700 border-amber-200/50',
  project: 'bg-blue-50 text-blue-700 border-blue-200/50',
  system:  'bg-gray-100 text-gray-600 border-gray-200',
}

function formatRelativeTime(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1)  return 'たった今'
  if (minutes < 60) return `${minutes}分前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)   return `${hours}時間前`
  const days = Math.floor(hours / 24)
  return `${days}日前`
}

/** Simple in-page toast for new realtime notifications (no external dep required) */
function NewNotificationToast({
  notification,
  onDismiss,
}: {
  notification: Notification
  onDismiss: () => void
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-4 right-4 z-[100] flex w-80 items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-lg animate-slide-up"
    >
      <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground leading-snug">{notification.title}</p>
        {notification.message && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{notification.message}</p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="通知を閉じる"
      >
        <Check className="h-4 w-4" />
      </button>
    </div>
  )
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState<Notification | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const unreadCount = notifications.filter(n => !n.is_read).length
  const preview = notifications.slice(0, 5)

  // Fetch latest 5 on mount
  useEffect(() => {
    fetch('/api/notifications?limit=5')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.notifications)) {
          setNotifications(data.notifications)
        }
      })
      .catch(() => {/* silently ignore on network issues */})
  }, [])

  // Supabase Realtime subscription — filter is applied server-side via RLS
  useEffect(() => {
    const channel = supabase
      .channel('notifications-bell')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        payload => {
          const incoming = payload.new as Notification
          setNotifications(prev => [incoming, ...prev.slice(0, 4)])
          setToast(incoming)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Close dropdown on Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  const markAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id)
    if (unreadIds.length === 0) return
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: unreadIds }),
    })
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen(o => !o)}
          className={cn(
            'relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
            open
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
          aria-label={`通知${unreadCount > 0 ? ` (未読 ${unreadCount} 件)` : ''}`}
          aria-expanded={open}
          aria-haspopup="true"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white leading-none"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <div
            role="menu"
            aria-label="通知一覧"
            className="absolute right-0 mt-2 w-80 rounded-xl border bg-white shadow-lg z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <span className="text-sm font-semibold text-foreground">通知</span>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Check className="h-3 w-3" />
                    全て既読
                  </button>
                )}
              </div>
            </div>

            {/* Notification list */}
            <ul className="max-h-72 overflow-y-auto divide-y" role="list">
              {preview.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  通知はありません
                </li>
              ) : (
                preview.map(n => (
                  <li
                    key={n.id}
                    role="menuitem"
                    className={cn(
                      'px-4 py-3 text-sm transition-colors',
                      !n.is_read && 'bg-blue-50/60'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn('font-medium leading-snug', !n.is_read ? 'text-foreground' : 'text-muted-foreground')}>
                        {n.title}
                      </p>
                      <span
                        className={cn(
                          'shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium',
                          TYPE_BADGE_CLASS[n.type] ?? TYPE_BADGE_CLASS.system
                        )}
                      >
                        {TYPE_LABEL[n.type] ?? n.type}
                      </span>
                    </div>
                    {n.message && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {n.message}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground/70">
                      {formatRelativeTime(n.created_at)}
                    </p>
                  </li>
                ))
              )}
            </ul>

            {/* Footer */}
            <div className="border-t px-4 py-2.5">
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1.5 text-xs text-primary hover:underline"
              >
                すべて見る
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <NewNotificationToast
          notification={toast}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  )
}
