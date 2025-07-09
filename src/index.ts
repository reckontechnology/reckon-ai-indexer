import 'reflect-metadata';
import dotenv from 'dotenv';
import { Application } from './app';
import { Logger } from './utils/logger';
import { DatabaseConnection } from './database/connection';
import { RedisConnection } from './cache/redis-connection';
import { WebSocketManager } from './websocket/websocket-manager';

// Load environment variables
dotenv.config();

const logger = new Logger('Main');

async function bootstrap(): Promise<void> {
  try {
    logger.info('🚀 Starting Reckon AI Indexer...');

    // Initialize database connection
    logger.info('📊 Connecting to PostgreSQL/TimescaleDB...');
    await DatabaseConnection.getInstance().connect();
    logger.info('✅ Database connected successfully');

    // Initialize Redis connection
    logger.info('🔄 Connecting to Redis...');
    await RedisConnection.getInstance().connect();
    logger.info('✅ Redis connected successfully');

    // Initialize application
    const app = new Application();
    
    // Initialize all services including Bittensor
    logger.info('🧠 Initializing AI services...');
    await app.initializeServices();
    logger.info('✅ AI services initialized successfully');

    // Start server
    const port = parseInt(process.env['PORT'] || '3001', 10);
    const server = app.listen(port, () => {
      logger.info(`🌟 Reckon AI Indexer running on port ${port}`);
      logger.info(`📡 API Documentation: http://localhost:${port}/api/v1/docs`);
      logger.info(`💻 Health Check: http://localhost:${port}/api/v1/health`);
      logger.info(`🔌 WebSocket: ws://localhost:${port}/api/v1/ws`);
    });

    // Initialize WebSocket manager
    const wsManager = new WebSocketManager(server);
    await wsManager.initialize();
    logger.info('🔌 WebSocket manager initialized');

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('🛑 SIGTERM received, shutting down gracefully...');
      await gracefulShutdown(server, app);
    });

    process.on('SIGINT', async () => {
      logger.info('🛑 SIGINT received, shutting down gracefully...');
      await gracefulShutdown(server, app);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('💥 Unhandled Rejection:', reason);
      process.exit(1);
    });

  } catch (error) {
    logger.error('💥 Failed to start application:', error);
    process.exit(1);
  }
}

async function gracefulShutdown(server: any, app: Application): Promise<void> {
  try {
    logger.info('🔄 Closing server...');
    server.close();

    logger.info('🔄 Shutting down AI services...');
    await app.shutdown();

    logger.info('🔄 Closing database connections...');
    await DatabaseConnection.getInstance().disconnect();

    logger.info('🔄 Closing Redis connections...');
    await RedisConnection.getInstance().disconnect();

    logger.info('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('💥 Error during shutdown:', error);
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  bootstrap();
}

export { bootstrap };
