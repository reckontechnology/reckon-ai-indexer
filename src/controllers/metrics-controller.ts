import { Request, Response } from 'express';
import { RedisConnection } from '../cache/redis-connection';
import { Logger } from '../utils/logger';

const logger = new Logger('MetricsController');

export class MetricsController {
  public static async getMetrics(_req: Request, res: Response): Promise<void> {
    try {
      const redis = RedisConnection.getInstance();
      
      // Get API usage metrics
      const apiMetrics = await MetricsController.getApiMetrics(redis);
      
      // Get system metrics
      const systemMetrics = await MetricsController.getSystemMetrics();
      
      // Get oracle metrics
      const oracleMetrics = await MetricsController.getOracleMetrics(redis);
      
      const metrics = {
        timestamp: new Date().toISOString(),
        api: apiMetrics,
        system: systemMetrics,
        oracles: oracleMetrics
      };
      
      res.json(metrics);
      
    } catch (error) {
      logger.error('Metrics collection failed:', error);
      res.status(500).json({
        error: 'Failed to collect metrics',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  private static async getApiMetrics(redis: RedisConnection): Promise<any> {
    try {
      const [
        totalRequests,
        successful,
        errors,
        activeConnections
      ] = await Promise.allSettled([
        redis.get('metrics:api:requests:total'),
        redis.get('metrics:api:requests:success'),
        redis.get('metrics:api:requests:error'),
        redis.get('metrics:ws:connections:active')
      ]);
      
      return {
        requests: {
          total: totalRequests.status === 'fulfilled' ? parseInt(totalRequests.value || '0', 10) : 0,
          successful: successful.status === 'fulfilled' ? parseInt(successful.value || '0', 10) : 0,
          errors: errors.status === 'fulfilled' ? parseInt(errors.value || '0', 10) : 0
        },
        websocket: {
          active_connections: activeConnections.status === 'fulfilled' ? parseInt(activeConnections.value || '0', 10) : 0
        },
        response_times: {
          avg: 0, // TODO: Implement response time tracking
          p95: 0,
          p99: 0
        }
      };
    } catch (error) {
      logger.error('Failed to get API metrics:', error);
      return {
        requests: { total: 0, successful: 0, errors: 0 },
        websocket: { active_connections: 0 },
        response_times: { avg: 0, p95: 0, p99: 0 }
      };
    }
  }
  
  private static async getSystemMetrics(): Promise<any> {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      memory: {
        heap_used: memUsage.heapUsed,
        heap_total: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
        usage_percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      uptime: process.uptime(),
      node_version: process.version,
      platform: process.platform,
      load_average: process.platform === 'linux' ? require('os').loadavg() : null
    };
  }
  
  private static async getOracleMetrics(redis: RedisConnection): Promise<any> {
    try {
      const [
        chainlinkRequests,
        pythRequests,
        priceUpdates,
        cacheHits,
        cacheMisses
      ] = await Promise.allSettled([
        redis.get('metrics:chainlink:requests'),
        redis.get('metrics:pyth:requests'),
        redis.get('metrics:price:updates'),
        redis.get('metrics:cache:hits'),
        redis.get('metrics:cache:misses')
      ]);
      
      const hits = cacheHits.status === 'fulfilled' ? parseInt(cacheHits.value || '0', 10) : 0;
      const misses = cacheMisses.status === 'fulfilled' ? parseInt(cacheMisses.value || '0', 10) : 0;
      const total = hits + misses;
      const hitRatio = total > 0 ? (hits / total) * 100 : 0;
      
      return {
        chainlink: {
          requests: chainlinkRequests.status === 'fulfilled' ? parseInt(chainlinkRequests.value || '0', 10) : 0,
          status: 'operational' // TODO: Get actual status
        },
        pyth: {
          requests: pythRequests.status === 'fulfilled' ? parseInt(pythRequests.value || '0', 10) : 0,
          status: 'operational' // TODO: Get actual status
        },
        price_updates: priceUpdates.status === 'fulfilled' ? parseInt(priceUpdates.value || '0', 10) : 0,
        cache: {
          hits,
          misses,
          hit_ratio_percentage: hitRatio
        }
      };
    } catch (error) {
      logger.error('Failed to get oracle metrics:', error);
      return {
        chainlink: { requests: 0, status: 'unknown' },
        pyth: { requests: 0, status: 'unknown' },
        price_updates: 0,
        cache: { hits: 0, misses: 0, hit_ratio_percentage: 0 }
      };
    }
  }
}
