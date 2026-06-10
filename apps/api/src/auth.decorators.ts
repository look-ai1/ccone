import { SetMetadata, createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedUser } from "./auth.types.js";

export const PERMISSIONS_KEY = "permissions";
export const SUPER_ADMIN_KEY = "superAdmin";
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);
export const RequireSuperAdmin = () => SetMetadata(SUPER_ADMIN_KEY, true);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
  return ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
});
