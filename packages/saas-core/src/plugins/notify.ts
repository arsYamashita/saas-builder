import { z } from 'zod'
import { registerPlugin } from './manifest'

const NotifyInputSchema = z.object({
  tenant_id: z.string().min(1),
  channel: z.enum(['email', 'slack', 'in-app']),
  event_type: z.string().min(1),
  payload: z.record(z.unknown()),
})

type NotifyInput = z.infer<typeof NotifyInputSchema>

registerPlugin({
  name: 'notify',
  version: '1.0.0',
  description: 'テナントへの通知送信（email / slack / in-app）',
  schema: {
    input: {
      type: 'object',
      properties: {
        tenant_id: { type: 'string' },
        channel: { type: 'string', enum: ['email', 'slack', 'in-app'] },
        event_type: { type: 'string' },
        payload: { type: 'object' },
      },
      required: ['tenant_id', 'channel', 'event_type', 'payload'],
    },
    output: {
      type: 'object',
      properties: {
        message_id: { type: 'string' },
        sent_at: { type: 'string' },
      },
    },
  },
  requiresApproval: false,
  async execute(input: unknown) {
    const validated = NotifyInputSchema.parse(input) as NotifyInput
    // 既存の @saas/notify の notify() を呼び出すことができる。
    // ここでは saas-core パッケージの依存を最小化するため直接呼び出しは行わず、
    // 呼び出し元（API route）が @saas/notify を使って実際の送信を実施する。
    // このプラグインはバリデーション + ID生成のみ担当。
    const message_id = crypto.randomUUID()
    const sent_at = new Date().toISOString()
    console.log(
      `[notify plugin] tenant=${validated.tenant_id} channel=${validated.channel} event=${validated.event_type} message_id=${message_id}`,
    )
    return { message_id, sent_at, ...validated }
  },
})
