import { Pool, PoolClient, PoolConfig } from 'pg';
import { Logger } from '../utils/logger';

export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private pool: Pool | null = null;
  private logger: Logger;

  private constructor() {
    this.logger = new Logger('Database');
  }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  public async connect(): Promise<void> {
    try {
      const config: PoolConfig = {
        connectionString: process.env['DATABASE_URL'],
        host: process.env['DB_HOST'],
        port: parseInt(process.env['DB_PORT'] || '5432', 10),
        database: process.env['DB_NAME'],
        user: process.env['DB_USER'],
        password: process.env['DB_PASSWORD'],
        min: parseInt(process.env['DB_POOL_MIN'] || '2', 10),
        max: parseInt(process.env['DB_POOL_MAX'] || '20', 10),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : false,
      };

      this.pool = new Pool(config);

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      // Setup event listeners
      this.pool.on('error', (err) => {
        this.logger.error('Database pool error:', err);
      });

      this.pool.on('connect', () => {
        this.logger.debug('New database connection established');
      });

      this.logger.info('Database connection pool initialized');
    } catch (error) {
      this.logger.error('Failed to connect to database:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.logger.info('Database connection pool closed');
    }
  }

  public async query(text: string, params?: any[]): Promise<any> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      this.logger.debug('Executed query', {
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        duration: `${duration}ms`,
        rows: result.rows.length
      });
      
      return result;
    } catch (error) {
      this.logger.error('Query execution failed:', error, {
        query: text,
        params
      });
      throw error;
    }
  }

  public async getClient(): Promise<PoolClient> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }
    return this.pool.connect();
  }

  public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public isConnected(): boolean {
    return this.pool !== null;
  }

  public getPool(): Pool | null {
    return this.pool;
  }
}
