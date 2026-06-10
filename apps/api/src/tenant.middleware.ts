import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedUser } from "./auth.types.js";
import type { TenantContextValue } from "./tenant-context.js";
import { verifyToken } from "./security/token.js";

declare module "express-serve-static-core" {
  interface Request {
    tenant: TenantContextValue;
    user?: AuthenticatedUser;
  }
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    const payload = token ? verifyToken(token) : null;

    if (payload) {
      req.user = {
        id: payload.sub,
        email: payload.email,
        isSuperAdmin: payload.isSuperAdmin,
        memberships: payload.memberships
      };
    }

    const requestedStoreId = req.header("x-store-id");
    let storeId: string;

    if (req.user?.isSuperAdmin) {
      // Super admin can operate on any store
      storeId = requestedStoreId ?? "store_demo";
    } else if (req.user && req.user.memberships.length > 0) {
      // Regular user: x-store-id must be in their memberships, else fall back to first membership
      const validStoreId = req.user.memberships.find((m) => m.storeId === requestedStoreId)?.storeId;
      storeId = validStoreId ?? req.user.memberships[0].storeId;
    } else {
      // Unauthenticated or no membership: accept header (guard will reject privileged endpoints)
      storeId = requestedStoreId ?? "store_demo";
    }

    // isSuperAdmin and actorId come strictly from the verified JWT — no header override
    req.tenant = {
      storeId,
      actorId: req.user?.id,
      isSuperAdmin: req.user?.isSuperAdmin ?? false
    };

    next();
  }
}
