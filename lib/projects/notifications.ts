import { notify } from '@/lib/notifications/inbox'

export async function notifyProjectCreated(userId: string, projectName: string) {
  await notify(
    userId,
    'プロジェクト作成完了',
    `「${projectName}」が作成されました`,
    { projectName }
  )
}

export async function notifyProjectDeleted(userId: string, projectName: string) {
  await notify(
    userId,
    'プロジェクト削除',
    `「${projectName}」が削除されました`,
    { projectName }
  )
}

export async function notifyGenerationCompleted(userId: string, projectName: string) {
  await notify(
    userId,
    'コード生成完了',
    `「${projectName}」のコード生成が完了しました`,
    { projectName }
  )
}
