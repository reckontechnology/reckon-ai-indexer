import { Request, Response, NextFunction } from 'express';
import { RedisConnection } from '../cache/redis-connection';
import { Logger } from '../utils/logger';
import { AuthenticatedRequest } from './auth-middleware';

const logger = new Logger('RateLimitMiddleware');

// Enhanced rate limiting with Redis store and user-based limits
export const rateLimitMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const redis = RedisConnection.getInstance();
    const apiKey = req.apiKey;
    const user = req.user;
    
    // Determine rate limit based on user tier
    let limit = 100; // Default free tier
    let windowMs = 900000; // 15 minutes
    
    if (apiKey) {
      // API key based limits
      if (apiKey.includes('enterprise')) {
        limit = 100000;
      } else if (apiKey.includes('pro')) {
        limit = 10000;
      } else if (apiKey.includes('starter')) {
        limit = 1000;
      }
    } else if (user) {
      // JWT based limits
      switch (user.tier) {
        case 'enterprise':
          limit = 100000;
          break;
        case 'professional':
          limit = 10000;
          break;
        case 'starter':
          limit = 1000;
          break;
        default:
          limit = 100;
      }
    }

    // Create rate limit key
    const identifier = apiKey || user?.userId || req.ip;
    const key = `ratelimit:${identifier}`;
    
    // Check current usage
    const current = await redis.get(key);
    const currentCount = current ? parseInt(current, 10) : 0;
    
    if (currentCount >= limit) {
      const ttl = await redis.getClient().ttl(key);
      
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Limit: ${limit} requests per ${windowMs / 1000} seconds`,
          details: {
            limit,
            current: currentCount,
            resetTime: Date.now() + (ttl * 1000)
          }
        },
        metadata: {
          timestamp: Date.now(),
          request_id: req.headers['x-request-id'] || 'unknown'
        }
      });
      return;
    }
    
    // Increment counter
    if (currentCount === 0) {
      await redis.set(key, '1', Math.floor(windowMs / 1000));
    } else {
      await redis.incr(key);
    }
    
    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': limit.toString(),
      'X-RateLimit-Remaining': Math.max(0, limit - currentCount - 1).toString(),
      'X-RateLimit-Reset': (Date.now() + windowMs).toString()
    });
    
    next();
  } catch (error) {
    logger.error('Rate limiting error:', error);
    // On error, allow the request to proceed
    next();
  }
};

// WebSocket rate limiting
export const wsRateLimitMiddleware = (
  connectionLimit: number = 100,
  messageLimit: number = 1000
) => {
  const connections = new Map<string, number>();
  const messages = new Map<string, { count: number; resetTime: number }>();
  
  return (ws: any, req: Request) => {
    const identifier = req.ip || 'unknown';
    const now = Date.now();
    
    // Connection limit
    const currentConnections = connections.get(identifier) || 0;
    if (currentConnections >= connectionLimit) {
      ws.close(1008, 'Connection limit exceeded');
      return false;
    }
    
    connections.set(identifier, currentConnections + 1);
    
    // Message rate limiting
    ws.on('message', () => {
      const messageData = messages.get(identifier);
      const hourlyResetTime = now + 3600000; // 1 hour
      
      if (!messageData || now > messageData.resetTime) {
        messages.set(identifier, { count: 1, resetTime: hourlyResetTime });
      } else {
        messageData.count++;
        if (messageData.count > messageLimit) {
          ws.close(1008, 'Message rate limit exceeded');
          return;
        }
      }
    });
    
    // Clean up on disconnect
    ws.on('close', () => {
      const current = connections.get(identifier) || 0;
      if (current > 1) {
        connections.set(identifier, current - 1);
      } else {
        connections.delete(identifier);
      }
    });
    
    return true;
  };
};
