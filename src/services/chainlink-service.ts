import { ethers, Contract, providers } from 'ethers';
import { ChainlinkFeed, PriceData } from '../types';
import { Logger } from '../utils/logger';
import { RedisConnection } from '../cache/redis-connection';

// Chainlink Price Feed ABI
const CHAINLINK_ABI = [
  {
    "inputs": [],
    "name": "latestRoundData",
    "outputs": [
      { "internalType": "uint80", "name": "roundId", "type": "uint80" },
      { "internalType": "int256", "name": "price", "type": "int256" },
      { "internalType": "uint256", "name": "startedAt", "type": "uint256" },
      { "internalType": "uint256", "name": "updatedAt", "type": "uint256" },
      { "internalType": "uint80", "name": "answeredInRound", "type": "uint80" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "description",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  }
];

export class ChainlinkService {
  private logger: Logger;
  private redis: RedisConnection;
  private providers: Map<string, providers.JsonRpcProvider>;
  private contracts: Map<string, Contract>;
  private feeds: ChainlinkFeed[];

  constructor() {
    this.logger = new Logger('ChainlinkService');
    this.redis = RedisConnection.getInstance();
    this.providers = new Map();
    this.contracts = new Map();
    this.feeds = this.initializeFeeds();
    
    this.initializeProviders();
    this.initializeContracts();
  }

  private initializeFeeds(): ChainlinkFeed[] {
    return [
      // Ethereum Mainnet
      { 
        network: "ethereum", 
        address: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", 
        decimals: 8, 
        pair: "ETH/USD", 
        heartbeat: 3600,
        description: "ETH / USD"
      },
      { 
        network: "ethereum", 
        address: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c", 
        decimals: 8, 
        pair: "BTC/USD", 
        heartbeat: 3600,
        description: "BTC / USD"
      },
      { 
        network: "ethereum", 
        address: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6", 
        decimals: 8, 
        pair: "USDC/USD", 
        heartbeat: 86400,
        description: "USDC / USD"
      },

      // Polygon
      { 
        network: "polygon", 
        address: "0xAB594600376Ec9fD91F8e885dADF0CE036862dE0", 
        decimals: 8, 
        pair: "MATIC/USD", 
        heartbeat: 30,
        description: "MATIC / USD"
      },
      { 
        network: "polygon", 
        address: "0xF9680D99D6C9589e2a93a78A04A279e509205945", 
        decimals: 8, 
        pair: "ETH/USD", 
        heartbeat: 27,
        description: "ETH / USD"
      },

      // Arbitrum
      { 
        network: "arbitrum", 
        address: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612", 
        decimals: 8, 
        pair: "ETH/USD", 
        heartbeat: 86400,
        description: "ETH / USD"
      },
      { 
        network: "arbitrum", 
        address: "0x6ce185860a4963106506C203335A2910413708e9", 
        decimals: 8, 
        pair: "BTC/USD", 
        heartbeat: 86400,
        description: "BTC / USD"
      },

      // Optimism
      { 
        network: "optimism", 
        address: "0x13e3Ee699D1909E989722E753853AE30b17e08c5", 
        decimals: 8, 
        pair: "ETH/USD", 
        heartbeat: 1200,
        description: "ETH / USD"
      },

      // Base
      { 
        network: "base", 
        address: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70", 
        decimals: 8, 
        pair: "ETH/USD", 
        heartbeat: 3600,
        description: "ETH / USD"
      },

      // Avalanche
      { 
        network: "avalanche", 
        address: "0x0A77230d17318075983913bC2145DB16C7366156", 
        decimals: 8, 
        pair: "AVAX/USD", 
        heartbeat: 300,
        description: "AVAX / USD"
      },
      { 
        network: "avalanche", 
        address: "0x31CF013A08c6Ac228C94551d535d5BAfE19c602a", 
        decimals: 8, 
        pair: "ETH/USD", 
        heartbeat: 86400,
        description: "ETH / USD"
      },

      // BSC
      { 
        network: "bsc", 
        address: "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE", 
        decimals: 8, 
        pair: "BNB/USD", 
        heartbeat: 10,
        description: "BNB / USD"
      },
      { 
        network: "bsc", 
        address: "0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf", 
        decimals: 8, 
        pair: "BTC/USD", 
        heartbeat: 3600,
        description: "BTC / USD"
      }
    ];
  }

  private initializeProviders(): void {
    const networks = [
      { name: 'ethereum', rpcUrl: process.env['ETHEREUM_RPC_URL'] },
      { name: 'polygon', rpcUrl: process.env['POLYGON_RPC_URL'] },
      { name: 'arbitrum', rpcUrl: process.env['ARBITRUM_RPC_URL'] },
      { name: 'optimism', rpcUrl: process.env['OPTIMISM_RPC_URL'] },
      { name: 'base', rpcUrl: process.env['BASE_RPC_URL'] },
      { name: 'avalanche', rpcUrl: process.env['AVALANCHE_RPC_URL'] },
      { name: 'bsc', rpcUrl: process.env['BSC_RPC_URL'] }
    ];

    for (const network of networks) {
      if (network.rpcUrl) {
        this.providers.set(network.name, new providers.JsonRpcProvider(network.rpcUrl));
        this.logger.debug(`Initialized provider for ${network.name}`);
      }
    }
  }

  private initializeContracts(): void {
    for (const feed of this.feeds) {
      const provider = this.providers.get(feed.network);
      if (provider) {
        const contract = new Contract(feed.address, CHAINLINK_ABI, provider);
        const key = `${feed.network}-${feed.pair}`;
        this.contracts.set(key, contract);
        this.logger.debug(`Initialized contract for ${key}`);
      }
    }
  }

  public async getPrice(network: string, pair: string): Promise<PriceData | null> {
    try {
      // Check cache first
      const cacheKey = `chainlink:${network}:${pair}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const feed = this.getFeedConfig(network, pair);
      if (!feed) {
        this.logger.warn(`Feed not found for ${network}:${pair}`);
        return null;
      }

      const contractKey = `${network}-${pair}`;
      const contract = this.contracts.get(contractKey);
      if (!contract) {
        this.logger.warn(`Contract not found for ${contractKey}`);
        return null;
      }

      const [, price, , updatedAt] = 
        await contract['latestRoundData']();

      const priceData: PriceData = {
        price: price.div(ethers.BigNumber.from(10).pow(feed.decimals)).toNumber(),
        timestamp: updatedAt.toNumber() * 1000,
        confidence: this.calculateConfidence(updatedAt.toNumber(), feed.heartbeat),
        source: "chainlink",
        network,
        pair
      };

      // Cache for 30 seconds
      await this.redis.set(
        cacheKey, 
        JSON.stringify(priceData), 
        parseInt(process.env['CACHE_TTL_PRICE'] || '30', 10)
      );

      this.logger.debug(`Retrieved price for ${network}:${pair}`, priceData);
      return priceData;

    } catch (error) {
      this.logger.error(`Failed to get price for ${network}:${pair}:`, error);
      return null;
    }
  }

  public async getAllPrices(): Promise<PriceData[]> {
    const promises = this.feeds.map(feed => 
      this.getPrice(feed.network, feed.pair)
    );

    const results = await Promise.allSettled(promises);
    const prices: PriceData[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        prices.push(result.value);
      }
    }

    this.logger.info(`Retrieved ${prices.length}/${this.feeds.length} Chainlink prices`);
    return prices;
  }

  public async subscribeToUpdates(callback: (data: PriceData) => void): Promise<void> {
    this.logger.info('Setting up Chainlink price subscriptions...');

    for (const feed of this.feeds) {
      const contractKey = `${feed.network}-${feed.pair}`;
      const contract = this.contracts.get(contractKey);
      
      if (contract) {
        try {
          contract.on("AnswerUpdated", async () => {
            try {
              const priceData = await this.getPrice(feed.network, feed.pair);
              if (priceData) {
                callback(priceData);
                this.logger.debug(`Price update received for ${feed.network}:${feed.pair}`);
              }
            } catch (error) {
              this.logger.error(`Error processing price update for ${feed.network}:${feed.pair}:`, error);
            }
          });

          this.logger.debug(`Subscribed to updates for ${contractKey}`);
        } catch (error) {
          this.logger.error(`Failed to subscribe to updates for ${contractKey}:`, error);
        }
      }
    }
  }

  public getFeedConfig(network: string, pair: string): ChainlinkFeed | undefined {
    return this.feeds.find(feed => feed.network === network && feed.pair === pair);
  }

  public getSupportedFeeds(): ChainlinkFeed[] {
    return this.feeds;
  }

  public getSupportedNetworks(): string[] {
    return [...new Set(this.feeds.map(feed => feed.network))];
  }

  public getSupportedPairs(network?: string): string[] {
    const filteredFeeds = network ? 
      this.feeds.filter(feed => feed.network === network) : 
      this.feeds;
    
    return [...new Set(filteredFeeds.map(feed => feed.pair))];
  }

  private calculateConfidence(updatedAt: number, heartbeat: number): number {
    const now = Math.floor(Date.now() / 1000);
    const ageSeconds = now - updatedAt;
    
    if (ageSeconds > heartbeat * 2) {
      return 0.5; // Low confidence for stale data
    } else if (ageSeconds > heartbeat) {
      return 0.8; // Medium confidence
    } else {
      return 0.98; // High confidence for fresh data
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      // Test a few key feeds
      const testFeeds = [
        { network: 'ethereum', pair: 'ETH/USD' },
        { network: 'polygon', pair: 'MATIC/USD' }
      ];

      const results = await Promise.allSettled(
        testFeeds.map(feed => this.getPrice(feed.network, feed.pair))
      );

      const successful = results.filter(result => 
        result.status === 'fulfilled' && result.value !== null
      ).length;

      return successful > 0;
    } catch (error) {
      this.logger.error('Chainlink health check failed:', error);
      return false;
    }
  }
}
