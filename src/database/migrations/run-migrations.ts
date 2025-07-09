import { DatabaseConnection } from '../connection';
import { Logger } from '../../utils/logger';
import fs from 'fs';
import path from 'path';

export class MigrationRunner {
  private db: DatabaseConnection;
  private logger: Logger;

  constructor() {
    this.db = DatabaseConnection.getInstance();
    this.logger = new Logger('MigrationRunner');
  }

  /**
   * Run all pending migrations
   */
  public async runMigrations(): Promise<void> {
    try {
      await this.db.connect();
      
      // Create migrations tracking table if it doesn't exist
      await this.createMigrationsTable();
      
      // Get list of migration files
      const migrationFiles = this.getMigrationFiles();
      
      // Get already applied migrations
      const appliedMigrations = await this.getAppliedMigrations();
      
      // Filter out already applied migrations
      const pendingMigrations = migrationFiles.filter(
        file => !appliedMigrations.includes(file)
      );

      if (pendingMigrations.length === 0) {
        this.logger.info('No pending migrations found');
        return;
      }

      this.logger.info(`Found ${pendingMigrations.length} pending migrations`);

      // Run each pending migration
      for (const migrationFile of pendingMigrations) {
        await this.runMigration(migrationFile);
      }

      this.logger.info('All migrations completed successfully');
    } catch (error) {
      this.logger.error('Migration failed:', error);
      throw error;
    }
  }

  /**
   * Create migrations tracking table
   */
  private async createMigrationsTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS system.migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    
    await this.db.query(query);
    this.logger.debug('Migrations tracking table ensured');
  }

  /**
   * Get list of migration files from the migrations directory
   */
  private getMigrationFiles(): string[] {
    const migrationsDir = path.join(__dirname);
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort to ensure proper order

    this.logger.debug(`Found migration files: ${files.join(', ')}`);
    return files;
  }

  /**
   * Get list of already applied migrations from database
   */
  private async getAppliedMigrations(): Promise<string[]> {
    try {
      const result = await this.db.query(
        'SELECT filename FROM system.migrations ORDER BY applied_at'
      );
      
      return result.rows.map((row: any) => row.filename);
    } catch (error) {
      // If migrations table doesn't exist, return empty array
      this.logger.debug('No migrations table found, starting fresh');
      return [];
    }
  }

  /**
   * Run a single migration file
   */
  private async runMigration(filename: string): Promise<void> {
    try {
      this.logger.info(`Running migration: ${filename}`);
      
      // Read migration file
      const migrationPath = path.join(__dirname, filename);
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
      
      // Start transaction
      await this.db.query('BEGIN');
      
      try {
        // Execute migration SQL
        await this.db.query(migrationSQL);
        
        // Record migration as applied
        await this.db.query(
          'INSERT INTO system.migrations (filename) VALUES ($1)',
          [filename]
        );
        
        // Commit transaction
        await this.db.query('COMMIT');
        
        this.logger.info(`Migration ${filename} completed successfully`);
      } catch (error) {
        // Rollback on error
        await this.db.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      this.logger.error(`Migration ${filename} failed:`, error);
      throw error;
    }
  }

  /**
   * Rollback the last migration
   */
  public async rollbackLastMigration(): Promise<void> {
    try {
      await this.db.connect();
      
      const result = await this.db.query(
        'SELECT filename FROM system.migrations ORDER BY applied_at DESC LIMIT 1'
      );
      
      if (result.rows.length === 0) {
        this.logger.info('No migrations to rollback');
        return;
      }
      
      const lastMigration = result.rows[0].filename;
      this.logger.warn(`Rolling back migration: ${lastMigration}`);
      
      // For safety, we don't automatically rollback SQL
      // Instead, we just remove the record from migrations table
      await this.db.query(
        'DELETE FROM system.migrations WHERE filename = $1',
        [lastMigration]
      );
      
      this.logger.warn(`Migration ${lastMigration} marked as not applied. Manual rollback may be required.`);
    } catch (error) {
      this.logger.error('Rollback failed:', error);
      throw error;
    }
  }

  /**
   * Get migration status
   */
  public async getMigrationStatus(): Promise<void> {
    try {
      await this.db.connect();
      
      const migrationFiles = this.getMigrationFiles();
      const appliedMigrations = await this.getAppliedMigrations();
      
      this.logger.info('Migration Status:');
      this.logger.info('================');
      
      for (const file of migrationFiles) {
        const status = appliedMigrations.includes(file) ? '✓ Applied' : '✗ Pending';
        this.logger.info(`${file}: ${status}`);
      }
      
      const pendingCount = migrationFiles.length - appliedMigrations.length;
      this.logger.info(`\nTotal: ${migrationFiles.length}, Applied: ${appliedMigrations.length}, Pending: ${pendingCount}`);
    } catch (error) {
      this.logger.error('Failed to get migration status:', error);
      throw error;
    }
  }
}

// CLI runner
if (require.main === module) {
  const runner = new MigrationRunner();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'migrate':
      runner.runMigrations()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
    
    case 'rollback':
      runner.rollbackLastMigration()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
    
    case 'status':
      runner.getMigrationStatus()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
    
    default:
      console.log('Usage: ts-node run-migrations.ts [migrate|rollback|status]');
      process.exit(1);
  }
}
