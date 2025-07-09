import Redis from 'ioredis';
import { Logger } from '../utils/logger';

export class RedisConnection {
  private static instance: RedisConnection;
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private publisher: Redis | null = null;
  private logger: Logger;

  private constructor() {
    this.logger = new Logger('Redis');
  }

  public static getInstance(): RedisConnection {
    if (!RedisConnection.instance) {
      RedisConnection.instance = new RedisConnection();
    }
    return RedisConnection.instance;
  }

  public async connect(): Promise<void> {
    try {
      const config = {
        host: process.env['REDIS_HOST'] || 'localhost',
        port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
        password: process.env['REDIS_PASSWORD'] || undefined,
        db: parseInt(process.env['REDIS_DB'] || '0', 10),
        keyPrefix: process.env['REDIS_KEY_PREFIX'] || 'reckon:',
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        reconnectOnError: (err: Error) => {
          const targetError = 'READONLY';
          return err.message.includes(targetError);
        },
      };

      // Filter out undefined password
      const filteredConfig = Object.fromEntries(
        Object.entries(config).filter(([_, value]) => value !== undefined)
      );

      // Main client for general operations
      this.client = new Redis(filteredConfig);
      
      // Separate clients for pub/sub
      this.subscriber = new Redis(filteredConfig);
      this.publisher = new Redis(filteredConfig);

      // Setup event listeners
      this.setupEventListeners(this.client, 'Main');
      this.setupEventListeners(this.subscriber, 'Subscriber');
      this.setupEventListeners(this.publisher, 'Publisher');

      // Test connections
      await Promise.all([
        this.client.ping(),
        this.subscriber.ping(),
        this.publisher.ping()
      ]);

      this.logger.info('Redis connections established successfully');
    } catch (error) {
      this.logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  private setupEventListeners(client: Redis, type: string): void {
    client.on('connect', () => {
      this.logger.debug(`Redis ${type} client connected`);
    });

    client.on('ready', () => {
      this.logger.debug(`Redis ${type} client ready`);
    });

    client.on('error', (error) => {
      this.logger.error(`Redis ${type} client error:`, error);
    });

    client.on('close', () => {
      this.logger.warn(`Redis ${type} client connection closed`);
    });

    client.on('reconnecting', () => {
      this.logger.info(`Redis ${type} client reconnecting...`);
    });
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.quit();
        this.client = null;
      }
      if (this.subscriber) {
        await this.subscriber.quit();
        this.subscriber = null;
      }
      if (this.publisher) {
        await this.publisher.quit();
        this.publisher = null;
      }
      this.logger.info('Redis connections closed');
    } catch (error) {
      this.logger.error('Error closing Redis connections:', error);
    }
  }

  public getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis not connected');
    }
    return this.client;
  }

  public getSubscriber(): Redis {
    if (!this.subscriber) {
      throw new Error('Redis subscriber not connected');
    }
    return this.subscriber;
  }

  public getPublisher(): Redis {
    if (!this.publisher) {
      throw new Error('Redis publisher not connected');
    }
    return this.publisher;
  }

  // Convenience methods
  public async get(key: string): Promise<string | null> {
    return this.getClient().get(key);
  }

  public async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.getClient().setex(key, ttl, value);
    } else {
      await this.getClient().set(key, value);
    }
  }

  public async del(key: string): Promise<void> {
    await this.getClient().del(key);
  }

  public async exists(key: string): Promise<boolean> {
    return (await this.getClient().exists(key)) === 1;
  }

  public async incr(key: string): Promise<number> {
    return this.getClient().incr(key);
  }

  public async expire(key: string, seconds: number): Promise<void> {
    await this.getClient().expire(key, seconds);
  }

  public async hget(key: string, field: string): Promise<string | null> {
    return this.getClient().hget(key, field);
  }

  public async hset(key: string, field: string, value: string): Promise<void> {
    await this.getClient().hset(key, field, value);
  }

  public async hdel(key: string, field: string): Promise<void> {
    await this.getClient().hdel(key, field);
  }

  public async publish(channel: string, message: string): Promise<void> {
    await this.getPublisher().publish(channel, message);
  }

  public async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    await this.getSubscriber().subscribe(channel);
    this.getSubscriber().on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        callback(message);
      }
    });
  }

  public isConnected(): boolean {
    return this.client !== null && this.client.status === 'ready';
  }
}
