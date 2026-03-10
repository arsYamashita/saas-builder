import { createClient } from '@/lib/supabase/server';

type Role = 'owner' | 'admin' | 'member';
type Resource = 'salon' | 'members' | 'plans' | 'content' | 'comments' | 'affiliates' | 'settings' | 'dashboard';
type Action = 'read' | 'write' | 'delete';

const PERMISSION_MATRIX: Record<Resource, Record<Action, Role[]>> = {
  salon: {
    read: ['owner', 'admin', 'member'],
    write: ['owner'],
    delete: ['owner']
  },
  members: {
    read: ['owner', 'admin'],
    write: ['owner'],
    delete: ['owner']
  },
  plans: {
    read: ['owner', 'admin', 'member'],
    write: ['owner'],
    delete: ['owner']
  },
  content: {
    read: ['owner', 'admin', 'member'],
    write: ['owner', 'admin'],
    delete: ['owner', 'admin']
  },
  comments: {
    read: ['owner', 'admin', 'member'],
    write: ['owner', 'admin', 'member'],
    delete: ['owner', 'admin']
  },
  affiliates: {
    read: ['owner'],
    write: ['owner'],
    delete: ['owner']
  },
  settings: {
    read: ['owner'],
    write: ['owner'],
    delete: ['owner']
  },
  dashboard: {
    read: ['owner', 'admin'],
    write: ['owner'],
    delete: ['owner']
  }
};

export async function checkPermission(
  salonId: string,
  action: Action,
  resource: Resource
): Promise<{ allowed: boolean; role?: Role }> {
  const supabase = createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { allowed: false };

  const { data: member } = await supabase
    .from('salon_members')
    .select('role, subscription_status')
    .eq('salon_id', salonId)
    .eq('user_id', user.id)
    .single();

  if (!member) return { allowed: false };

  const permissions = PERMISSION_MATRIX[resource]?.[action];
  const allowed = permissions?.includes(member.role as Role) ?? false;

  return { allowed, role: member.role as Role };
}