export type AppUser = {
  id: string;
  email: string;
  displayName?: string | null;
};

export type AuthSession = {
  user: AppUser | null;
};
