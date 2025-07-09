import { DatabaseConnection } from '../database/connection';
import { RedisConnection } from '../cache/redis-connection';
import { UnifiedPriceData, PriceData, TimeFrame } from '../types';
import { Logger } from '../utils/logger';

export interface HistoricalPricePoint {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  source_count: number;
  confidence: number;
}

export interface PriceHistoryQuery {
  symbol: string;
  chain: string;
  timeframe: TimeFrame;
  limit?: number;
  startTime?: Date;
  endTime?: Date;
}

export class HistoricalDataService {
  private db: DatabaseConnection;
  private redis: RedisConnection;
  private logger: Logger;

  constructor() {
    this.db = DatabaseConnection.getInstance();
    this.redis = RedisConnection.getInstance();
    this.logger = new Logger('HistoricalDataService');
  }

  /**
   * Store unified price data for historical analysis
   */
  public async storePriceData(priceData: UnifiedPriceData): Promise<void> {
    try {
      const query = `
        INSERT INTO price_data.unified_prices (
          symbol, chain, unified_price, confidence, source_count,
          price_deviation, arbitrage_count, timestamp, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (timestamp, symbol, chain) 
        DO UPDATE SET 
          unified_price = EXCLUDED.unified_price,
          confidence = EXCLUDED.confidence,
          source_count = EXCLUDED.source_count,
          price_deviation = EXCLUDED.price_deviation,
          arbitrage_count = EXCLUDED.arbitrage_count,
          metadata = EXCLUDED.metadata;
      `;

      await this.db.query(query, [
        priceData.symbol,
        priceData.chain,
        priceData.price,
        priceData.confidence,
        priceData.source_count,
        priceData.price_deviation,
        priceData.arbitrage_opportunities.length,
        new Date(priceData.timestamp),
        JSON.stringify(priceData.metadata)
      ]);

      this.logger.debug(`Stored price data for ${priceData.chain}:${priceData.symbol}`);
    } catch (error) {
      this.logger.error('Failed to store price data:', error);
      throw error;
    }
  }

  /**
   * Store individual source price data
   */
  public async storeSourcePriceData(priceData: PriceData): Promise<void> {
    try {
      const query = `
        INSERT INTO price_data.price_feeds (
          symbol, chain, price, confidence, source, timestamp, raw_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (timestamp, symbol, chain, source) 
        DO UPDATE SET 
          price = EXCLUDED.price,
          confidence = EXCLUDED.confidence,
          raw_data = EXCLUDED.raw_data;
      `;

      await this.db.query(query, [
        priceData.pair.split('/')[0], // Extract symbol from pair
        priceData.network,
        priceData.price,
        priceData.confidence,
        priceData.source,
        new Date(priceData.timestamp),
        JSON.stringify(priceData)
      ]);

      this.logger.debug(`Stored source price data: ${priceData.source}:${priceData.pair}`);
    } catch (error) {
      this.logger.error('Failed to store source price data:', error);
      throw error;
    }
  }

  /**
   * Get historical price data with OHLCV aggregation
   */
  public async getPriceHistory(query: PriceHistoryQuery): Promise<HistoricalPricePoint[]> {
    try {
      // Check cache first
      const cacheKey = `history:${query.chain}:${query.symbol}:${query.timeframe}:${query.limit}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const timeInterval = this.getTimeInterval(query.timeframe);
      const limit = query.limit || 100;

      const sqlQuery = `
        SELECT 
          time_bucket($1, timestamp) as time_bucket,
          FIRST(unified_price, timestamp) as open,
          MAX(unified_price) as high,
          MIN(unified_price) as low,
          LAST(unified_price, timestamp) as close,
          AVG(confidence) as confidence,
          AVG(source_count) as source_count,
          COUNT(*) as data_points
        FROM price_data.unified_prices
        WHERE symbol = $2 AND chain = $3
          ${query.startTime ? 'AND timestamp >= $4' : ''}
          ${query.endTime ? `AND timestamp <= $${query.startTime ? 5 : 4}` : ''}
        GROUP BY time_bucket
        ORDER BY time_bucket DESC
        LIMIT $${query.startTime && query.endTime ? 6 : query.startTime || query.endTime ? 5 : 4};
      `;

      const params: (string | number)[] = [timeInterval, query.symbol, query.chain];
      if (query.startTime) params.push(query.startTime.toISOString());
      if (query.endTime) params.push(query.endTime.toISOString());
      params.push(limit);

      const result = await this.db.query(sqlQuery, params);

      const historyData: HistoricalPricePoint[] = result.rows.map((row: any) => ({
        timestamp: row.time_bucket,
        open: parseFloat(row.open),
        high: parseFloat(row.high),
        low: parseFloat(row.low),
        close: parseFloat(row.close),
        confidence: parseFloat(row.confidence),
        source_count: parseInt(row.source_count),
        volume: 0 // TODO: Calculate volume when available
      }));

      // Cache for 5 minutes
      await this.redis.set(cacheKey, JSON.stringify(historyData), 300);

      this.logger.debug(`Retrieved ${historyData.length} historical points for ${query.chain}:${query.symbol}`);
      return historyData;

    } catch (error) {
      this.logger.error('Failed to get price history:', error);
      throw error;
    }
  }

  /**
   * Get price statistics for a given period
   */
  public async getPriceStatistics(symbol: string, chain: string, hours: number = 24): Promise<any> {
    try {
      const cacheKey = `stats:${chain}:${symbol}:${hours}h`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const query = `
        SELECT 
          COUNT(*) as data_points,
          AVG(unified_price) as avg_price,
          STDDEV(unified_price) as price_volatility,
          MIN(unified_price) as min_price,
          MAX(unified_price) as max_price,
          FIRST(unified_price, timestamp) as price_24h_ago,
          LAST(unified_price, timestamp) as current_price,
          AVG(confidence) as avg_confidence,
          AVG(source_count) as avg_source_count,
          AVG(price_deviation) as avg_deviation
        FROM price_data.unified_prices
        WHERE symbol = $1 AND chain = $2
          AND timestamp >= NOW() - INTERVAL '${hours} hours'
      `;

      const result = await this.db.query(query, [symbol, chain]);
      const stats = result.rows[0];

      if (!stats || !stats.data_points) {
        return null;
      }

      const priceChange24h = stats.current_price - stats.price_24h_ago;
      const priceChangePercent24h = ((priceChange24h / stats.price_24h_ago) * 100);

      const statistics = {
        symbol,
        chain,
        period_hours: hours,
        current_price: parseFloat(stats.current_price),
        avg_price: parseFloat(stats.avg_price),
        min_price: parseFloat(stats.min_price),
        max_price: parseFloat(stats.max_price),
        volatility: parseFloat(stats.price_volatility),
        price_change_24h: priceChange24h,
        price_change_percent_24h: priceChangePercent24h,
        avg_confidence: parseFloat(stats.avg_confidence),
        avg_source_count: parseFloat(stats.avg_source_count),
        avg_deviation: parseFloat(stats.avg_deviation),
        data_points: parseInt(stats.data_points)
      };

      // Cache for 10 minutes
      await this.redis.set(cacheKey, JSON.stringify(statistics), 600);

      return statistics;

    } catch (error) {
      this.logger.error('Failed to get price statistics:', error);
      throw error;
    }
  }

  /**
   * Get top performing assets by price change
   */
  public async getTopPerformers(hours: number = 24, limit: number = 10): Promise<any[]> {
    try {
      const cacheKey = `top_performers:${hours}h:${limit}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const query = `
        WITH price_changes AS (
          SELECT 
            symbol,
            chain,
            FIRST(unified_price, timestamp) as price_start,
            LAST(unified_price, timestamp) as price_end,
            COUNT(*) as data_points
          FROM price_data.unified_prices
          WHERE timestamp >= NOW() - INTERVAL '${hours} hours'
          GROUP BY symbol, chain
          HAVING COUNT(*) >= 5  -- Minimum data points
        )
        SELECT 
          symbol,
          chain,
          price_start,
          price_end,
          (price_end - price_start) as price_change,
          ((price_end - price_start) / price_start * 100) as price_change_percent,
          data_points
        FROM price_changes
        WHERE price_start > 0
        ORDER BY price_change_percent DESC
        LIMIT $1;
      `;

      const result = await this.db.query(query, [limit]);
      const performers = result.rows.map((row: any) => ({
        symbol: row.symbol,
        chain: row.chain,
        price_start: parseFloat(row.price_start),
        price_end: parseFloat(row.price_end),
        price_change: parseFloat(row.price_change),
        price_change_percent: parseFloat(row.price_change_percent),
        data_points: parseInt(row.data_points)
      }));

      // Cache for 15 minutes
      await this.redis.set(cacheKey, JSON.stringify(performers), 900);

      return performers;

    } catch (error) {
      this.logger.error('Failed to get top performers:', error);
      throw error;
    }
  }

  /**
   * Clean old data beyond retention period
   */
  public async cleanOldData(retentionDays: number = 90): Promise<void> {
    try {
      const queries = [
        `DELETE FROM price_data.price_feeds WHERE timestamp < NOW() - INTERVAL '${retentionDays} days'`,
        `DELETE FROM price_data.unified_prices WHERE timestamp < NOW() - INTERVAL '${retentionDays} days'`
      ];

      let totalDeleted = 0;
      for (const query of queries) {
        const result = await this.db.query(query);
        totalDeleted += result.rowCount || 0;
      }

      this.logger.info(`Cleaned ${totalDeleted} old price records older than ${retentionDays} days`);
    } catch (error) {
      this.logger.error('Failed to clean old data:', error);
      throw error;
    }
  }

  private getTimeInterval(timeframe: TimeFrame): string {
    const intervals: Record<TimeFrame, string> = {
      '1m': '1 minute',
      '5m': '5 minutes',
      '15m': '15 minutes',
      '1h': '1 hour',
      '4h': '4 hours',
      '1d': '1 day',
      '1w': '1 week',
      '1M': '1 month'
    };

    return intervals[timeframe] || '1 hour';
  }
}
