import { createClient } from '@/lib/db/supabase/server';

export interface NotifyPayload {
  userId: string;
  type: 'billing' | 'project' | 'system';
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export async function notify(payload: NotifyPayload): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('notifications').insert({
    user_id: payload.userId,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    metadata: payload.metadata ?? null,
  });
  if (error) throw error;
}
