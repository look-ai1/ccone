import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface TenantContextValue {
  storeId: string;
  actorId?: string;
  isSuperAdmin: boolean;
}

export const TenantContext = createParamDecorator((_data: unknown, ctx: ExecutionContext): TenantContextValue => {
  const request = ctx.switchToHttp().getRequest<{ tenant: TenantContextValue }>();
  return request.tenant;
});
