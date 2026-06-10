export interface AuthenticatedUser {
  id: string;
  email: string;
  isSuperAdmin: boolean;
  memberships: Array<{ storeId: string; role: string; permissions: string[] }>;
}
