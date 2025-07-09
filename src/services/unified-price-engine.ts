import { ChainlinkService } from './chainlink-service';
import { PythService } from './pyth-service';
import { UnifiedPriceData, PriceData, PythPriceData, ArbitrageOpportunity } from '../types';
import { Logger } from '../utils/logger';
import { RedisConnection } from '../cache/redis-connection';

interface PriceSource {
  source: string;
  price: number;
  confidence: number;
  timestamp: number;
  latency: number;
}

export class UnifiedPriceEngine {
  private chainlinkService: ChainlinkService;
  private pythService: PythService;
  private redis: RedisConnection;
  private logger: Logger;

  constructor() {
    this.chainlinkService = new ChainlinkService();
    this.pythService = new PythService();
    this.redis = RedisConnection.getInstance();
    this.logger = new Logger('UnifiedPriceEngine');
  }

  public async getUnifiedPrice(symbol: string, chain: string): Promise<UnifiedPriceData> {
    try {
      // Check cache first
      const cacheKey = `unified:${chain}:${symbol}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for ${chain}:${symbol}`);
        return JSON.parse(cached);
      }

      // Fetch from all sources in parallel
      const [chainlinkPrice, pythPrice] = await Promise.allSettled([
        this.getChainlinkPrice(chain, symbol),
        this.getPythPrice(symbol)
      ]);

      const sources: PriceSource[] = [];

      // Process Chainlink data
      if (chainlinkPrice.status === 'fulfilled' && chainlinkPrice.value) {
        sources.push({
          source: 'chainlink',
          price: chainlinkPrice.value.price,
          confidence: chainlinkPrice.value.confidence,
          timestamp: chainlinkPrice.value.timestamp,
          latency: Date.now() - chainlinkPrice.value.timestamp
        });
      }

      // Process Pyth data
      if (pythPrice.status === 'fulfilled' && pythPrice.value) {
        sources.push({
          source: 'pyth',
          price: pythPrice.value.price,
          confidence: pythPrice.value.confidence,
          timestamp: pythPrice.value.timestamp,
          latency: Date.now() - pythPrice.value.publishTime
        });
      }

      if (sources.length === 0) {
        throw new Error(`No price data available for ${symbol} on ${chain}`);
      }

      // Calculate weighted average
      const weightedPrice = this.calculateWeightedAverage(sources);

      // Detect arbitrage opportunities
      const arbitrageOpportunities = this.detectArbitrage(sources);

      const unifiedData: UnifiedPriceData = {
        symbol,
        chain,
        price: weightedPrice.price,
        confidence: weightedPrice.confidence,
        timestamp: Date.now(),
        sources: sources.map(s => s.source),
        source_count: sources.length,
        price_deviation: this.calculateDeviation(sources),
        arbitrage_opportunities: arbitrageOpportunities,
        metadata: {
          last_updated: Date.now(),
          data_freshness: this.calculateFreshness(sources),
          api_version: '1.0'
        }
      };

      // Cache for 30 seconds
      await this.redis.set(
        cacheKey,
        JSON.stringify(unifiedData),
        parseInt(process.env['CACHE_TTL_PRICE'] || '30', 10)
      );

      this.logger.debug(`Unified price calculated for ${chain}:${symbol}`, {
        price: unifiedData.price,
        sources: unifiedData.sources,
        confidence: unifiedData.confidence
      });

      return unifiedData;

    } catch (error) {
      this.logger.error(`Failed to get unified price for ${symbol} on ${chain}:`, error);
      throw error;
    }
  }

  private async getChainlinkPrice(chain: string, symbol: string): Promise<PriceData | null> {
    const pair = `${symbol}/USD`;
    return await this.chainlinkService.getPrice(chain, pair);
  }

  private async getPythPrice(symbol: string): Promise<PythPriceData | null> {
    const pair = `${symbol}/USD`;
    return await this.pythService.getPrice(pair);
  }

  private calculateWeightedAverage(sources: PriceSource[]): { price: number; confidence: number } {
    if (sources.length === 0) {
      throw new Error('No price sources available');
    }

    if (sources.length === 1) {
      const source = sources[0];
      if (!source) throw new Error('Invalid source data');
      return { price: source.price, confidence: source.confidence };
    }

    // Weight by confidence and recency
    const now = Date.now();
    const totalWeight = sources.reduce((sum, source) => {
      const ageWeight = Math.max(0, 1 - (now - source.timestamp) / 300000); // 5 min decay
      return sum + (source.confidence * ageWeight);
    }, 0);

    if (totalWeight === 0) {
      // Fallback to simple average if no valid weights
      const avgPrice = sources.reduce((sum, s) => sum + s.price, 0) / sources.length;
      const avgConfidence = sources.reduce((sum, s) => sum + s.confidence, 0) / sources.length;
      return { price: avgPrice, confidence: avgConfidence };
    }

    const weightedPrice = sources.reduce((sum, source) => {
      const ageWeight = Math.max(0, 1 - (now - source.timestamp) / 300000);
      const weight = (source.confidence * ageWeight) / totalWeight;
      return sum + (source.price * weight);
    }, 0);

    const avgConfidence = sources.reduce((sum, s) => sum + s.confidence, 0) / sources.length;

    return { price: weightedPrice, confidence: avgConfidence };
  }

  private calculateDeviation(sources: PriceSource[]): number {
    if (sources.length <= 1) return 0;

    const prices = sources.map(s => s.price);
    const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    
    const variance = prices.reduce((sum, price) => {
      return sum + Math.pow(price - avgPrice, 2);
    }, 0) / prices.length;

    const standardDeviation = Math.sqrt(variance);
    return (standardDeviation / avgPrice) * 100; // Return as percentage
  }

  private detectArbitrage(sources: PriceSource[]): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];

    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const sourceI = sources[i];
        const sourceJ = sources[j];
        
        if (!sourceI || !sourceJ) continue;
        
        const priceDiff = Math.abs(sourceI.price - sourceJ.price);
        const avgPrice = (sourceI.price + sourceJ.price) / 2;
        const spreadPercentage = (priceDiff / avgPrice) * 100;

        if (spreadPercentage > 0.1) { // 0.1% threshold
          opportunities.push({
            buy_source: sourceI.price < sourceJ.price ? sourceI.source : sourceJ.source,
            sell_source: sourceI.price < sourceJ.price ? sourceJ.source : sourceI.source,
            spread_percentage: spreadPercentage,
            profit_potential: priceDiff,
            confidence: Math.min(sourceI.confidence, sourceJ.confidence)
          });
        }
      }
    }

    return opportunities.sort((a, b) => b.spread_percentage - a.spread_percentage);
  }

  private calculateFreshness(sources: PriceSource[]): string {
    if (sources.length === 0) return 'unknown';

    const mostRecentTimestamp = Math.max(...sources.map(s => s.timestamp));
    const ageSeconds = Math.floor((Date.now() - mostRecentTimestamp) / 1000);

    if (ageSeconds < 60) return `${ageSeconds}s`;
    if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)}m`;
    return `${Math.floor(ageSeconds / 3600)}h`;
  }
}
