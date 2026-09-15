import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../../../common/roles.guard.js';

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedRequest['user'], ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: any }>();
    const user = request.user;
    if (!user) return null;
    return data ? user[data] : user;
  },
);
