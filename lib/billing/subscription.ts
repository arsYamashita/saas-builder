import { notify } from '@/lib/notifications/inbox'

export async function handleSubscriptionCreated(userId: string, plan: string) {
  await notify(
    userId,
    'サブスクリプション開始',
    `${plan} プランが有効になりました`,
    { plan }
  )
}

export async function handleSubscriptionUpdated(userId: string, plan: string) {
  await notify(
    userId,
    'プラン変更完了',
    `${plan} プランに変更されました`,
    { plan }
  )
}

export async function handlePaymentFailed(userId: string, amount: number) {
  await notify(
    userId,
    '支払い失敗',
    `¥${amount.toLocaleString()} の請求が失敗しました。支払い方法を確認してください。`,
    { amount }
  )
}
