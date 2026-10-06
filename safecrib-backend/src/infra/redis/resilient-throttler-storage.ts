import { Injectable, Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { getRedis } from '../../lib/redis.js';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

interface LocalLimit {
  hits: number;
  expiresAt: number;
  blockedUntil: number;
}

const MAX_LOCAL_LIMITS = 10_000;

@Injectable()
export class ResilientThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(ResilientThrottlerStorage.name);
  private readonly localLimits = new Map<string, LocalLimit>();
  private lastFallbackWarning = 0;
  private readonly script = `
    local hitKey = KEYS[1]
    local blockKey = KEYS[2]
    local ttl = tonumber(ARGV[1])
    local limit = tonumber(ARGV[2])
    local blockDuration = tonumber(ARGV[3])
    local totalHits = redis.call('INCR', hitKey)
    local timeToExpire = redis.call('PTTL', hitKey)
    if timeToExpire <= 0 then
      redis.call('PEXPIRE', hitKey, ttl)
      timeToExpire = ttl
    end
    local timeToBlockExpire = redis.call('PTTL', blockKey)
    local isBlocked = timeToBlockExpire > 0
    if not isBlocked and totalHits > limit then
      redis.call('SET', blockKey, 1, 'PX', blockDuration)
      isBlocked = true
      timeToBlockExpire = blockDuration
    end
    return {totalHits, timeToExpire, isBlocked and 1 or 0, math.max(0, timeToBlockExpire)}
  `;

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redis = getRedis();
    if (redis.status !== 'ready') {
      this.warnFallback();
      return this.incrementLocally(key, ttl, limit, blockDuration, throttlerName);
    }

    const hitKey = `{${key}:${throttlerName}}:hits`;
    const blockKey = `{${key}:${throttlerName}}:blocked`;
    let result: unknown;
    try {
      result = await redis.eval(
        this.script,
        2,
        hitKey,
        blockKey,
        ttl,
        limit,
        blockDuration,
      );
    } catch (error) {
      this.warnFallback(error);
      return this.incrementLocally(key, ttl, limit, blockDuration, throttlerName);
    }
    if (!Array.isArray(result) || result.length !== 4) {
      throw new TypeError('Redis rate limiter returned an invalid response');
    }
    const [hits, ttlRemaining, blocked, blockRemaining] = result.map(Number);
    if ([hits, ttlRemaining, blocked, blockRemaining].some(Number.isNaN)) {
      throw new TypeError('Redis rate limiter returned non-numeric values');
    }
    return {
      totalHits: hits,
      timeToExpire: Math.ceil(ttlRemaining / 1000),
      isBlocked: blocked === 1,
      timeToBlockExpire: Math.ceil(blockRemaining / 1000),
    };
  }

  private incrementLocally(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): ThrottlerStorageRecord {
    const now = Date.now();
    const id = `${throttlerName}:${key}`;
    let state = this.localLimits.get(id);
    if (state && now >= state.expiresAt && now >= state.blockedUntil) {
      this.localLimits.delete(id);
      state = undefined;
    }
    if (!state) {
      this.pruneLocalLimits(now);
      if (this.localLimits.size >= MAX_LOCAL_LIMITS) {
        const oldestKey = this.localLimits.keys().next().value;
        if (oldestKey !== undefined) this.localLimits.delete(oldestKey);
      }
      state = { hits: 0, expiresAt: now + ttl, blockedUntil: 0 };
      this.localLimits.set(id, state);
    }

    state.hits += 1;
    if (state.hits > limit && state.blockedUntil <= now) {
      state.blockedUntil = now + blockDuration;
    }
    return {
      totalHits: state.hits,
      timeToExpire: Math.max(0, Math.ceil((state.expiresAt - now) / 1000)),
      isBlocked: state.blockedUntil > now,
      timeToBlockExpire: Math.max(0, Math.ceil((state.blockedUntil - now) / 1000)),
    };
  }

  private pruneLocalLimits(now: number): void {
    for (const [storedKey, value] of this.localLimits) {
      if (now >= value.expiresAt && now >= value.blockedUntil) {
        this.localLimits.delete(storedKey);
      }
    }
  }

  private warnFallback(error?: unknown): void {
    const now = Date.now();
    if (now - this.lastFallbackWarning < 60_000) return;
    this.lastFallbackWarning = now;
    this.logger.warn(
      `Rate limiting is using per-instance memory because Redis is unavailable${error instanceof Error ? `: ${error.message}` : ''}`,
    );
  }
}
