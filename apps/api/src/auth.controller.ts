import { Body, Controller, Get, Post, ServiceUnavailableException, UnauthorizedException, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { PrismaService } from "./prisma.service.js";
import { verifyPassword } from "./security/password.js";
import { signToken } from "./security/token.js";
import { CurrentUser } from "./auth.decorators.js";
import { PermissionGuard } from "./auth.guard.js";
import type { AuthenticatedUser } from "./auth.types.js";
import { InMemoryStore } from "./in-memory-store.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: InMemoryStore
  ) {}

  @Post("login")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async login(@Body() body: { email: string; password: string }) {
    if (!body.email || !body.password || body.email.length > 320 || body.password.length > 1024) {
      throw new UnauthorizedException("Invalid email or password");
    }
    try {
      const user = await this.prisma.user.findUnique({
        where: { email: body.email },
        include: {
          memberships: {
            include: { role: true }
          }
        }
      });
      if (!user || !verifyPassword(body.password, user.passwordHash)) {
        throw new UnauthorizedException("Invalid email or password");
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });

      const authUser: AuthenticatedUser = {
        id: user.id,
        email: user.email,
        isSuperAdmin: user.isSuperAdmin,
        memberships: user.memberships.map((membership) => ({
          storeId: membership.storeId,
          role: membership.role.key,
          permissions: membership.role.permissions
        }))
      };

      return this.issueToken(authUser);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // DB unavailable: only allow non-super-admin in-memory users (demo store accounts)
      const inMemoryUser = this.store.findUserByCredentials(body.email, body.password);
      if (inMemoryUser && !inMemoryUser.isSuperAdmin) {
        return this.issueToken(inMemoryUser);
      }
      throw new ServiceUnavailableException("Database unavailable");
    }
  }

  private issueToken(authUser: AuthenticatedUser) {
    return {
      token: signToken({
        sub: authUser.id,
        email: authUser.email,
        isSuperAdmin: authUser.isSuperAdmin,
        memberships: authUser.memberships
      }),
      user: authUser
    };
  }

  @Get("me")
  @UseGuards(PermissionGuard)
  me(@CurrentUser() user?: AuthenticatedUser) {
    return user ?? null;
  }
}
