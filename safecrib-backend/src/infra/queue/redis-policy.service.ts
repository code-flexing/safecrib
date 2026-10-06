import { Injectable, Logger } from '@nestjs/common';
import { getRedis } from '../../lib/redis.js';

@Injectable()
export class RedisPolicyService {
  private readonly logger = new Logger(RedisPolicyService.name);
  private checked = false;

  async checkPolicy(): Promise<void> {
    if (this.checked) return;
    this.checked = true;

    try {
      const response = await getRedis().config('GET', 'maxmemory-policy');
      const policy = Array.isArray(response) ? response[1] : undefined;
      if (policy !== 'noeviction') {
        this.logger.warn(
          `Redis maxmemory-policy is ${policy ?? 'unknown'}; configure noeviction in Render Key Value settings`,
        );
      } else {
        this.logger.log('Redis maxmemory-policy is noeviction');
      }
    } catch (error) {
      this.logger.warn(
        `Could not inspect Redis maxmemory-policy: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
