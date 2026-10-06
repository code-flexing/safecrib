import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { PUBLIC_KEY } from '../../../common/public.decorator.js';
import type { Observable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    (request as any).__isPublicRoute = isPublic;

    if (isPublic) {
      try {
        const result = super.canActivate(context);
        if (result instanceof Promise) {
          return result.catch(() => true);
        }
        return result;
      } catch {
        // Ignore auth errors on public routes
      }
      return true;
    }

    return super.canActivate(context);
  }

  override handleRequest<T>(
    err: Error | null,
    user: T | false | null,
    _info: unknown,
    context?: ExecutionContext,
  ): T | null {
    let isPublic = false;
    if (context) {
      const request = context.switchToHttp().getRequest();
      isPublic = (request as any).__isPublicRoute ?? false;
    }

    if (isPublic) {
      return user === false ? null : user;
    }

    if (err || !user) {
      throw err ?? new UnauthorizedException('Invalid or expired access token');
    }
    return user;
  }
}
