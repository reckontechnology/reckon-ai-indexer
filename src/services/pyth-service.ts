import { PythFeed, PythPriceData } from '../types';
import { Logger } from '../utils/logger';
import { RedisConnection } from '../cache/redis-connection';
import WebSocket from 'ws';

export class PythService {
  private logger: Logger;
  private redis: RedisConnection;
  private feeds: PythFeed[];
  private subscriptions: Map<string, Set<(data: PythPriceData) => void>>;
  private wsConnection: WebSocket | null = null;

  constructor() {
    this.logger = new Logger('PythService');
    this.redis = RedisConnection.getInstance();
    this.feeds = this.initializeFeeds();
    this.subscriptions = new Map();
    this.wsConnection = null;
  }

  private initializeFeeds(): PythFeed[] {
    return [
      // Major cryptocurrencies
      { 
        id: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", 
        symbol: "BTC/USD", 
        network: "multi", 
        confidence_interval: 0.01,
        asset_type: "crypto"
      },
      { 
        id: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace", 
        symbol: "ETH/USD", 
        network: "multi", 
        confidence_interval: 0.01,
        asset_type: "crypto"
      },
      { 
        id: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d", 
        symbol: "SOL/USD", 
        network: "solana", 
        confidence_interval: 0.01,
        asset_type: "crypto"
      },
      
      // Layer 1 tokens
      { 
        id: "0x5de33a9112c2b700b8d30b8a3402c103578ccfa2765696471cc672bd5cf6ac52", 
        symbol: "MATIC/USD", 
        network: "polygon", 
        confidence_interval: 0.02,
        asset_type: "crypto"
      },
      { 
        id: "0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744", 
        symbol: "SUI/USD", 
        network: "sui", 
        confidence_interval: 0.02,
        asset_type: "crypto"
      },
      { 
        id: "0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7", 
        symbol: "AVAX/USD", 
        network: "avalanche", 
        confidence_interval: 0.02,
        asset_type: "crypto"
      },
      { 
        id: "0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f", 
        symbol: "BNB/USD", 
        network: "bsc", 
        confidence_interval: 0.02,
        asset_type: "crypto"
      },

      // Stablecoins
      { 
        id: "0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b", 
        symbol: "USDT/USD", 
        network: "multi", 
        confidence_interval: 0.001,
        asset_type: "stablecoin"
      },
      { 
        id: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a", 
        symbol: "USDC/USD", 
        network: "multi", 
        confidence_interval: 0.001,
        asset_type: "stablecoin"
      },
      { 
        id: "0xb0948a5e5313200c632b51bb5ca32f6de0d36e9950a942d19751e833f70dabfd", 
        symbol: "DAI/USD", 
        network: "multi", 
        confidence_interval: 0.001,
        asset_type: "stablecoin"
      },

      // Layer 2 tokens
      { 
        id: "0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5", 
        symbol: "ARB/USD", 
        network: "arbitrum", 
        confidence_interval: 0.03,
        asset_type: "crypto"
      },
      { 
        id: "0x385f64d993f7b77d8182ed5003d97c60aa3361f3cecfe711544d2d59165e9bdf", 
        symbol: "OP/USD", 
        network: "optimism", 
        confidence_interval: 0.03,
        asset_type: "crypto"
      },

      // DeFi tokens
      { 
        id: "0x4b5ab61593a2401b1075b90c04cbcdd3f87ce011498602a88d217758d5a2a77e", 
        symbol: "LINK/USD", 
        network: "multi", 
        confidence_interval: 0.02,
        asset_type: "crypto"
      },
      { 
        id: "0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419", 
        symbol: "UNI/USD", 
        network: "ethereum", 
        confidence_interval: 0.02,
        asset_type: "crypto"
      }
    ];
  }

  public async getPrice(symbol: string): Promise<PythPriceData | null> {
    try {
      // Check cache first
      const cacheKey = `pyth:${symbol}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const feed = this.feeds.find(f => f.symbol === symbol);
      if (!feed) {
        this.logger.warn(`Feed not found for ${symbol}`);
        return null;
      }

      // For now, return mock data since Pyth client setup needs more configuration
      const pythPrice: PythPriceData = {
        symbol: feed.symbol,
        price: 0, // Placeholder
        confidence: 0.95,
        timestamp: Date.now(),
        network: feed.network,
        source: "pyth",
        publishTime: Date.now()
      };

      // Cache for 30 seconds
      await this.redis.set(
        cacheKey, 
        JSON.stringify(pythPrice), 
        parseInt(process.env['CACHE_TTL_PRICE'] || '30', 10)
      );

      this.logger.debug(`Retrieved price for ${symbol}`, pythPrice);
      return pythPrice;

    } catch (error) {
      this.logger.error(`Failed to get price for ${symbol}:`, error);
      return null;
    }
  }

  public async getAllPrices(): Promise<PythPriceData[]> {
    try {
      // For now, return empty array since we need proper Pyth client setup
      const prices: PythPriceData[] = [];

      this.logger.info(`Retrieved ${prices.length}/${this.feeds.length} Pyth prices`);
      return prices;

    } catch (error) {
      this.logger.error('Failed to get all Pyth prices:', error);
      return [];
    }
  }

  public async subscribeToUpdates(symbols: string[], callback: (data: PythPriceData) => void): Promise<void> {
    try {
      const feedIds = symbols
        .map(symbol => this.feeds.find(f => f.symbol === symbol)?.id)
        .filter(Boolean) as string[];

      if (feedIds.length === 0) {
        this.logger.warn('No valid feed IDs found for symbols:', symbols);
        return;
      }

      // Store subscription callback
      symbols.forEach(symbol => {
        if (!this.subscriptions.has(symbol)) {
          this.subscriptions.set(symbol, new Set());
        }
        this.subscriptions.get(symbol)!.add(callback);
      });

      // Initialize WebSocket connection if needed
      if (!this.wsConnection || this.wsConnection.readyState !== WebSocket.OPEN) {
        await this.initializeWebSocket();
      }

      // Subscribe to price feeds
      if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
        const subscribeMessage = {
          type: "subscribe",
          ids: feedIds
        };

        this.wsConnection.send(JSON.stringify(subscribeMessage));
        this.logger.info(`Subscribed to ${feedIds.length} Pyth price feeds`);
      }

    } catch (error) {
      this.logger.error('Failed to subscribe to Pyth updates:', error);
    }
  }

  private async initializeWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = process.env['PYTH_WS_URL'] || 'wss://hermes.pyth.network/ws';
        this.wsConnection = new WebSocket(wsUrl);

        this.wsConnection.onopen = () => {
          this.logger.info('Pyth WebSocket connection established');
          resolve();
        };

        this.wsConnection.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data.toString());
            this.handleWebSocketMessage(data);
          } catch (error) {
            this.logger.error('Error parsing WebSocket message:', error);
          }
        };

        this.wsConnection.onclose = () => {
          this.logger.warn('Pyth WebSocket connection closed');
          // Attempt to reconnect after 5 seconds
          setTimeout(() => this.initializeWebSocket(), 5000);
        };

        this.wsConnection.onerror = (error) => {
          this.logger.error('Pyth WebSocket error:', error);
          reject(error);
        };

      } catch (error) {
        this.logger.error('Failed to initialize Pyth WebSocket:', error);
        reject(error);
      }
    });
  }

  private handleWebSocketMessage(data: any): void {
    try {
      if (data.type === 'price_update' && data.price_feed) {
        const feedId = data.price_feed.id;
        const feed = this.feeds.find(f => f.id === feedId);
        
        if (feed) {
          const priceUpdate: PythPriceData = {
            symbol: feed.symbol,
            price: data.price_feed.price.price,
            confidence: data.price_feed.price.conf,
            timestamp: Date.now(),
            network: feed.network,
            source: "pyth",
            publishTime: data.price_feed.price.publish_time * 1000
          };

          // Notify all subscribers for this symbol
          const callbacks = this.subscriptions.get(feed.symbol);
          if (callbacks) {
            callbacks.forEach(callback => {
              try {
                callback(priceUpdate);
              } catch (error) {
                this.logger.error('Error in subscription callback:', error);
              }
            });
          }

          // Update cache
          this.redis.set(
            `pyth:${feed.symbol}`,
            JSON.stringify(priceUpdate),
            parseInt(process.env['CACHE_TTL_PRICE'] || '30', 10)
          );

          this.logger.debug(`Price update received for ${feed.symbol}`);
        }
      }
    } catch (error) {
      this.logger.error('Error handling WebSocket message:', error);
    }
  }

  public getFeedConfig(symbol: string): PythFeed | undefined {
    return this.feeds.find(feed => feed.symbol === symbol);
  }

  public getSupportedFeeds(): PythFeed[] {
    return this.feeds;
  }

  public getSupportedSymbols(): string[] {
    return this.feeds.map(feed => feed.symbol);
  }

  public getSupportedNetworks(): string[] {
    return [...new Set(this.feeds.map(feed => feed.network))];
  }

  public async healthCheck(): Promise<boolean> {
    try {
      // Test a few key feeds
      const testSymbols = ['BTC/USD', 'ETH/USD', 'SOL/USD'];
      const results = await Promise.allSettled(
        testSymbols.map(symbol => this.getPrice(symbol))
      );

      const successful = results.filter(result => 
        result.status === 'fulfilled' && result.value !== null
      ).length;

      return successful > 0;
    } catch (error) {
      this.logger.error('Pyth health check failed:', error);
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
    this.subscriptions.clear();
    this.logger.info('Pyth service disconnected');
  }
}
