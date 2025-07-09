import express, { Application as ExpressApp, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
// import expressWs from 'express-ws';

import { Logger } from './utils/logger';
import { errorHandler } from './middleware/error-handler';
import { authMiddleware } from './middleware/auth-middleware';
import { rateLimitMiddleware } from './middleware/rate-limit-middleware';
import { apiRouter } from './routes';
import { HealthController } from './controllers/health-controller';
import { MetricsController } from './controllers/metrics-controller';
import { BittensorService } from './services/bittensor-service';

export class Application {
  private app: ExpressApp;
  private logger: Logger;
  // private wsInstance?: expressWs.Instance;
  private bittensorService: BittensorService;

  constructor() {
    this.logger = new Logger('Application');
    this.bittensorService = new BittensorService();
    
    // Initialize Express first
    this.app = express();
    
    // Temporarily disable WebSocket support to isolate the issue
    // this.wsInstance = expressWs(this.app);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  public async initialize(): Promise<void> {
    this.setupSecurity();
    
    this.logger.info('🏗️ Application initialized successfully');
  }

  /**
   * Initialize all services
   */
  public async initializeServices(): Promise<void> {
    try {
      this.logger.info('Initializing services...');
      
      // Initialize Bittensor AI service
      await this.bittensorService.initialize();
      
      this.logger.info('All services initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize services:', error);
      throw error;
    }
  }

  /**
   * Shutdown all services gracefully
   */
  public async shutdown(): Promise<void> {
    try {
      this.logger.info('Shutting down services...');
      
      // Disconnect Bittensor service
      await this.bittensorService.disconnect();
      
      this.logger.info('All services shut down successfully');
    } catch (error) {
      this.logger.error('Error during shutdown:', error);
    }
  }

  private setupSecurity(): void {
    // Security headers
    this.app.use(helmet({
      contentSecurityPolicy: process.env['HELMET_CONTENT_SECURITY_POLICY'] === 'true',
      crossOriginEmbedderPolicy: false,
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env['CORS_ORIGIN']?.split(',') || '*',
      methods: process.env['CORS_METHODS']?.split(',') || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: process.env['CORS_ALLOW_CREDENTIALS'] === 'true',
      optionsSuccessStatus: 200
    }));        // Global rate limiting
        const globalRateLimit = rateLimit({
          windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '900000', 10), // 15 minutes
          max: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || '1000', 10),
          message: {
            error: 'Too many requests from this IP',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: 900
          },
          standardHeaders: true,
          legacyHeaders: false,
        });

        this.app.use('/api', globalRateLimit);
  }

  private setupMiddleware(): void {
    // Request compression
    this.app.use(compression({
      threshold: 1024,
      level: 6,
      memLevel: 8,
    }));

    // Body parsing
    this.app.use(express.json({ 
      limit: '10mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      }
    }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging
    if (process.env['ENABLE_REQUEST_LOGGING'] === 'true') {
      this.app.use(morgan(process.env['LOG_FORMAT'] || 'combined'));
    }        // Custom middleware
        this.app.use(rateLimitMiddleware);
  }

  private setupRoutes(): void {
    // Health check endpoint (no auth required)
    this.app.get('/health', HealthController.check);
    this.app.get('/api/v1/health', HealthController.check);
    
    // Metrics endpoint (no auth required for monitoring)
    this.app.get('/metrics', MetricsController.getMetrics);
    this.app.get('/api/v1/metrics', MetricsController.getMetrics);

    // API documentation
    this.app.get('/api/v1/docs', (_req: Request, res: Response) => {
      res.json({
        name: 'Reckon AI Indexer API',
        version: '1.0.0',
        description: 'Enterprise-Grade Blockchain Data Platform with AI-Powered Analytics',
        documentation: 'https://docs.reckon.ai',
        endpoints: {
          health: '/api/v1/health',
          prices: '/api/v1/prices/{chain}/{asset}',
          batch_prices: '/api/v1/prices/batch',
          ai_predictions: '/api/v1/ai/predictions/{asset}',
          websocket: 'ws://localhost:3001/api/v1/ws'
        },
        contact: {
          email: 'support@reckon.ai',
          website: 'https://reckon.ai'
        }
      });
    });

    // Protected API routes
    this.app.use('/api/v1', authMiddleware, apiRouter);

    // 404 handler - using a safer approach without problematic wildcard
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: 'Endpoint not found',
        code: 'NOT_FOUND',
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public listen(port: number, callback?: () => void): any {
    return this.app.listen(port, callback);
  }

  public getApp(): ExpressApp {
    return this.app;
  }

  // public getWsInstance(): expressWs.Instance | undefined {
  //   return this.wsInstance;
  // }

  public getBittensorService(): BittensorService {
    return this.bittensorService;
  }
}
