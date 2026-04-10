'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, Check, CheckCheck, CreditCard, FolderKanban, Settings } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import type { Notification, NotificationType } from '@/components/dashboard/NotificationBell'
import { createClient } from '@/lib/db/supabase/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FilterType = 'all' | NotificationType

interface PaginatedResponse {
  notifications: Notification[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

const FILTER_TABS: { value: FilterType; label: string }[] = [
  { value: 'all',     label: 'すべて' },
  { value: 'billing', label: '請求' },
  { value: 'project', label: 'プロジェクト' },
  { value: 'system',  label: 'システム' },
]

const TYPE_ICON: Record<NotificationType, React.ElementType> = {
  billing: CreditCard,
  project: FolderKanban,
  system:  Settings,
}

const TYPE_BADGE_VARIANT: Record<NotificationType, 'warning' | 'info' | 'secondary'> = {
  billing: 'warning',
  project: 'info',
  system:  'secondary',
}

const TYPE_LABEL: Record<NotificationType, string> = {
  billing: '請求',
  project: 'プロジェクト',
  system:  'システム',
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString('ja-JP', {
    year:   'numeric',
    month:  'short',
    day:    'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [total, setTotal]   = useState(0)
  const [page, setPage]     = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [filter, setFilter] = useState<FilterType>('all')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchNotifications = useCallback(async (nextPage: number, type: FilterType) => {
    setLoading(true)
    const params = new URLSearchParams({
      page:  String(nextPage),
      limit: String(PAGE_SIZE),
    })
    if (type !== 'all') params.set('type', type)

    const res  = await fetch(`/api/notifications?${params}`)
    const data: PaginatedResponse = await res.json()

    setNotifications(prev =>
      nextPage === 1 ? data.notifications : [...prev, ...data.notifications]
    )
    setTotal(data.total)
    setPage(nextPage)
    setHasMore(data.hasMore)
    setLoading(false)
  }, [])

  // Initial load + filter change
  useEffect(() => {
    fetchNotifications(1, filter)
  }, [filter, fetchNotifications])

  // Realtime: prepend new notifications if they match the current filter
  useEffect(() => {
    const channel = supabase
      .channel('notifications-page')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        payload => {
          const incoming = payload.new as Notification
          if (filter === 'all' || incoming.type === filter) {
            setNotifications(prev => [incoming, ...prev])
            setTotal(t => t + 1)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const toggleRead = async (id: string, currentIsRead: boolean) => {
    const nextIsRead = !currentIsRead
    // Optimistic update
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, is_read: nextIsRead } : n)
    )
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_read: nextIsRead }),
    })
  }

  const markAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id)
    if (unreadIds.length === 0) return
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: unreadIds }),
    })
  }

  const loadMore = () => fetchNotifications(page + 1, filter)

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const unreadCount = notifications.filter(n => !n.is_read).length

  const NotificationRow = ({ n }: { n: Notification }) => {
    const Icon = TYPE_ICON[n.type] ?? Settings
    return (
      <div
        className={cn(
          'group flex items-start gap-4 rounded-xl border px-4 py-3.5 transition-colors',
          !n.is_read
            ? 'border-blue-100 bg-blue-50/40'
            : 'border-border bg-card hover:bg-muted/40'
        )}
      >
        {/* Icon */}
        <div
          className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
            !n.is_read
              ? 'border-blue-100 bg-blue-100 text-blue-600'
              : 'border-border bg-muted text-muted-foreground'
          )}
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('text-sm font-medium', !n.is_read ? 'text-foreground' : 'text-muted-foreground')}>
              {n.title}
            </span>
            <Badge variant={TYPE_BADGE_VARIANT[n.type] ?? 'secondary'}>
              {TYPE_LABEL[n.type] ?? n.type}
            </Badge>
            {!n.is_read && (
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-label="未読" />
            )}
          </div>
          {n.message && (
            <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{n.message}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground/60">{formatDate(n.created_at)}</p>
        </div>

        {/* Toggle read button */}
        <button
          onClick={() => toggleRead(n.id, n.is_read)}
          className={cn(
            'shrink-0 rounded-lg p-1.5 text-xs transition-colors',
            'opacity-0 group-hover:opacity-100 focus:opacity-100',
            n.is_read
              ? 'text-muted-foreground hover:bg-muted'
              : 'text-blue-600 hover:bg-blue-100'
          )}
          aria-label={n.is_read ? '未読にする' : '既読にする'}
          title={n.is_read ? '未読にする' : '既読にする'}
        >
          {n.is_read ? <Bell className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
        </button>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <PageHeader
        title="通知"
        description={total > 0 ? `${total} 件の通知` : undefined}
        action={
          unreadCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={markAllRead}
              className="gap-1.5"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              一括既読
            </Button>
          ) : undefined
        }
      />

      {/* Filter tabs */}
      <div
        role="tablist"
        aria-label="通知フィルター"
        className="flex gap-1 rounded-lg border bg-muted/50 p-1 w-fit"
      >
        {FILTER_TABS.map(tab => (
          <button
            key={tab.value}
            role="tab"
            aria-selected={filter === tab.value}
            onClick={() => setFilter(tab.value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              filter === tab.value
                ? 'bg-white text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading && notifications.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border bg-muted"
              aria-hidden="true"
            />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="通知はありません"
          description="新しい通知が届くとここに表示されます"
        />
      ) : (
        <div
          role="list"
          aria-label="通知リスト"
          className="space-y-2"
        >
          {notifications.map(n => (
            <div key={n.id} role="listitem">
              <NotificationRow n={n} />
            </div>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={loading}
          >
            {loading ? 'ロード中…' : 'さらに読み込む'}
          </Button>
        </div>
      )}
    </div>
  )
}
