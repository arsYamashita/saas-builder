import { Role } from '@/lib/permissions/rbac';

interface NavItem {
  title: string;
  href: string;
  icon: string;
  roles: Role[];
  children?: Omit<NavItem, 'icon' | 'roles' | 'children'>[];
}

export const dashboardNav: NavItem[] = [
  {
    title: 'Overview',
    href: '/dashboard/[tenant]',
    icon: 'LayoutDashboard',
    roles: ['owner', 'admin'],
  },
  {
    title: 'Members',
    href: '/dashboard/[tenant]/members',
    icon: 'Users',
    roles: ['owner', 'admin'],
  },
  {
    title: 'Content',
    href: '/dashboard/[tenant]/content',
    icon: 'FileText',
    roles: ['owner', 'admin'],
  },
  {
    title: 'Subscriptions',
    href: '/dashboard/[tenant]/subscriptions',
    icon: 'CreditCard',
    roles: ['owner', 'admin'],
  },
  {
    title: 'Plans',
    href: '/dashboard/[tenant]/plans',
    icon: 'Package',
    roles: ['owner'],
  },
  {
    title: 'Affiliates',
    href: '/dashboard/[tenant]/affiliates',
    icon: 'TrendingUp',
    roles: ['owner', 'admin'],
    children: [
      {
        title: 'Dashboard',
        href: '/dashboard/[tenant]/affiliates',
      },
      {
        title: 'Links',
        href: '/dashboard/[tenant]/affiliates/links',
      },
      {
        title: 'Commissions',
        href: '/dashboard/[tenant]/affiliates/commissions',
      },
    ],
  },
  {
    title: 'Settings',
    href: '/dashboard/[tenant]/settings',
    icon: 'Settings',
    roles: ['owner'],
  },
  {
    title: 'My Affiliate',
    href: '/dashboard/[tenant]/my-affiliate',
    icon: 'Link',
    roles: ['owner', 'admin', 'member'],
  },
];

export function filterNavByRole(role: Role): NavItem[] {
  return dashboardNav.filter((item) => item.roles.includes(role));
}