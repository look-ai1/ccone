import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSIONS_KEY, SUPER_ADMIN_KEY } from "./auth.decorators.js";
import type { AuthenticatedUser } from "./auth.types.js";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    const requiresSuperAdmin = this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN_KEY, [context.getHandler(), context.getClass()]);

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser; tenant?: { storeId: string } }>();
    const user = request.user;
    if (requiresSuperAdmin) {
      if (!user) {
        throw new UnauthorizedException("Missing authentication token");
      }
      if (!user.isSuperAdmin) {
        throw new ForbiddenException("Super admin account required");
      }
      return true;
    }

    if (!required?.length) {
      return true;
    }

    if (!user) {
      throw new UnauthorizedException("Missing authentication token");
    }
    if (user.isSuperAdmin) {
      return true;
    }

    const storeId = request.tenant?.storeId;
    const membership = user.memberships.find((item) => item.storeId === storeId);
    if (!membership) {
      throw new ForbiddenException("No membership for current tenant");
    }
    const allowed = required.every((permission) => membership.permissions.includes(permission));
    if (!allowed) {
      throw new ForbiddenException("Insufficient permissions");
    }
    return true;
  }
}
