import { Request, Response } from 'express';
import { DatabaseConnection } from '../database/connection';
import { RedisConnection } from '../cache/redis-connection';
import { ChainlinkService } from '../services/chainlink-service';
import { PythService } from '../services/pyth-service';
import { Logger } from '../utils/logger';

const logger = new Logger('HealthController');

export class HealthController {
  public static async check(_req: Request, res: Response): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Check database connection
      const dbHealth = await HealthController.checkDatabase();
      
      // Check Redis connection
      const redisHealth = await HealthController.checkRedis();
      
      // Check external services
      const chainlinkHealth = await HealthController.checkChainlink();
      const pythHealth = await HealthController.checkPyth();
      
      const responseTime = Date.now() - startTime;
      
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime(),
        response_time_ms: responseTime,
        services: {
          database: dbHealth,
          redis: redisHealth,
          chainlink: chainlinkHealth,
          pyth: pythHealth
        },
        system: {
          memory: {
            used: process.memoryUsage().heapUsed,
            total: process.memoryUsage().heapTotal,
            external: process.memoryUsage().external,
            rss: process.memoryUsage().rss
          },
          cpu: process.cpuUsage(),
          node_version: process.version,
          platform: process.platform,
          arch: process.arch
        }
      };
      
      // Determine overall status
      const allServices = Object.values(health.services);
      const hasUnhealthyService = allServices.some(service => service.status !== 'healthy');
      
      if (hasUnhealthyService) {
        health.status = 'degraded';
        res.status(503);
      } else {
        res.status(200);
      }
      
      res.json(health);
      
    } catch (error) {
      logger.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: {
          message: 'Health check failed',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }
  
  private static async checkDatabase(): Promise<any> {
    try {
      const db = DatabaseConnection.getInstance();
      if (!db.isConnected()) {
        return { status: 'unhealthy', error: 'Database not connected' };
      }
      
      const startTime = Date.now();
      await db.query('SELECT 1');
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        response_time_ms: responseTime,
        type: 'postgresql'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Database check failed',
        type: 'postgresql'
      };
    }
  }
  
  private static async checkRedis(): Promise<any> {
    try {
      const redis = RedisConnection.getInstance();
      if (!redis.isConnected()) {
        return { status: 'unhealthy', error: 'Redis not connected' };
      }
      
      const startTime = Date.now();
      await redis.getClient().ping();
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        response_time_ms: responseTime,
        type: 'redis'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Redis check failed',
        type: 'redis'
      };
    }
  }
  
  private static async checkChainlink(): Promise<any> {
    try {
      const chainlink = new ChainlinkService();
      const isHealthy = await chainlink.healthCheck();
      
      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        type: 'chainlink_oracle',
        supported_networks: chainlink.getSupportedNetworks().length,
        supported_feeds: chainlink.getSupportedFeeds().length
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Chainlink check failed',
        type: 'chainlink_oracle'
      };
    }
  }
  
  private static async checkPyth(): Promise<any> {
    try {
      const pyth = new PythService();
      const isHealthy = await pyth.healthCheck();
      
      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        type: 'pyth_oracle',
        supported_symbols: pyth.getSupportedSymbols().length,
        supported_networks: pyth.getSupportedNetworks().length
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Pyth check failed',
        type: 'pyth_oracle'
      };
    }
  }
}
