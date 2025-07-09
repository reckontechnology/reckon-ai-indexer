// ===================================
// CORE PRICE DATA TYPES
// ===================================

export interface PriceData {
  price: number;
  timestamp: number;
  confidence: number;
  source: string;
  network: string;
  pair: string;
}

export interface UnifiedPriceData {
  symbol: string;
  chain: string;
  price: number;
  confidence: number;
  timestamp: number;
  sources: string[];
  source_count: number;
  price_deviation: number;
  arbitrage_opportunities: ArbitrageOpportunity[];
  ai_consensus?: AIPrediction;
  metadata?: {
    last_updated: number;
    data_freshness: string;
    api_version: string;
  };
}

export interface PythPriceData {
  symbol: string;
  price: number;
  confidence: number;
  timestamp: number;
  network: string;
  source: string;
  publishTime: number;
}

export interface ArbitrageOpportunity {
  buy_source: string;
  sell_source: string;
  spread_percentage: number;
  profit_potential: number;
  confidence: number;
}

// ===================================
// AI PREDICTION TYPES
// ===================================

export interface AIPrediction {
  prediction_1h: number;
  prediction_24h?: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  risk_score: number;
  contributing_miners: number;
  timestamp: number;
  reasoning?: string;
}

export interface SentimentData {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  score: number;
  confidence: number;
  sources: string[];
  social_mentions: number;
  news_sentiment: number;
  timestamp: number;
}

export interface BittensorMiner {
  hotkey: string;
  stake: number;
  rank: number;
  trust: number;
  incentive: number;
  emission: number;
  vtrust: number;
  updated_at: number;
  active: boolean;
}

// ===================================
// BLOCKCHAIN NETWORK TYPES
// ===================================

export interface ChainlinkFeed {
  network: string;
  address: string;
  decimals: number;
  pair: string;
  heartbeat: number;
  description?: string;
}

export interface PythFeed {
  id: string;
  symbol: string;
  network: string;
  confidence_interval: number;
  asset_type?: string;
}

export interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  wsUrl?: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  isTestnet: boolean;
}

// ===================================
// API TYPES
// ===================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    timestamp: number;
    request_id: string;
    processing_time_ms: number;
    api_version: string;
  };
}

export interface BatchPriceRequest {
  requests: Array<{
    symbol: string;
    chain: string;
  }>;
}

export interface BatchPriceResponse {
  request_id: string;
  results: UnifiedPriceData[];
  total_requests: number;
  successful: number;
  failed: number;
  processing_time_ms: number;
}

// ===================================
// AUTHENTICATION TYPES
// ===================================

export interface ApiKey {
  id: string;
  key_hash: string;
  name: string;
  tier: 'free' | 'starter' | 'professional' | 'enterprise';
  rate_limit: number;
  features: string[];
  created_at: Date;
  last_used_at?: Date;
  expires_at?: Date;
  is_active: boolean;
}

export interface User {
  id: string;
  email: string;
  username: string;
  tier: 'free' | 'starter' | 'professional' | 'enterprise';
  api_keys: ApiKey[];
  created_at: Date;
  updated_at: Date;
}

export interface JwtPayload {
  userId: string;
  email: string;
  tier: string;
  iat: number;
  exp: number;
}

// ===================================
// WEBSOCKET TYPES
// ===================================

export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'price_update' | 'ai_update' | 'error' | 'heartbeat';
  payload?: any;
  timestamp: number;
  request_id?: string;
}

export interface PriceSubscription {
  symbol: string;
  chain: string;
  callback: (data: UnifiedPriceData) => void;
}

// ===================================
// MARKET DATA TYPES
// ===================================

export interface MarketOverview {
  total_market_cap: number;
  total_volume_24h: number;
  bitcoin_dominance: number;
  ethereum_dominance: number;
  active_cryptocurrencies: number;
  market_cap_change_24h: number;
  trending_assets: TrendingAsset[];
  top_gainers: MarketAsset[];
  top_losers: MarketAsset[];
}

export interface TrendingAsset {
  symbol: string;
  name: string;
  price: number;
  price_change_24h: number;
  volume_24h: number;
  market_cap: number;
  trending_score: number;
}

export interface MarketAsset {
  symbol: string;
  name: string;
  price: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  volume_24h: number;
  market_cap: number;
  rank: number;
}

// ===================================
// ANALYTICS TYPES
// ===================================

export interface CorrelationData {
  asset1: string;
  asset2: string;
  correlation: number;
  timeframe: string;
  confidence: number;
  sample_size: number;
}

export interface RiskAssessment {
  asset: string;
  risk_score: number;
  volatility: number;
  liquidity_score: number;
  market_cap_risk: number;
  technical_indicators: {
    rsi: number;
    macd: number;
    bollinger_bands: {
      upper: number;
      middle: number;
      lower: number;
    };
  };
  ai_risk_factors: string[];
}

// ===================================
// ERROR TYPES
// ===================================

export interface ApiError extends Error {
  code: string;
  status: number;
  details?: any;
}

export class ReckonError extends Error implements ApiError {
  public code: string;
  public status: number;
  public details?: any;

  constructor(message: string, code: string, status: number = 500, details?: any) {
    super(message);
    this.name = 'ReckonError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// ===================================
// DEPLOYMENT TYPES
// ===================================

export interface AkashDeploymentConfig {
  sdl: string;
  deposit: string;
  attributes: {
    region: string[];
    tier: string;
    datacenter: string;
  };
}

export interface DeploymentResult {
  deploymentId: string;
  leaseId: string;
  provider: string;
  cost: string;
  region: string;
}

// ===================================
// UTILITY TYPES
// ===================================

export type SupportedChain = 
  | 'ethereum' 
  | 'polygon' 
  | 'arbitrum' 
  | 'optimism' 
  | 'base' 
  | 'avalanche' 
  | 'bsc' 
  | 'solana'
  | 'sui';

export type SupportedAsset = 
  | 'ETH' 
  | 'BTC' 
  | 'MATIC' 
  | 'ARB' 
  | 'OP' 
  | 'AVAX' 
  | 'BNB' 
  | 'SOL' 
  | 'SUI'
  | 'USDT'
  | 'USDC'
  | 'DAI';

export type TimeFrame = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w' | '1M';

export type OrderType = 'asc' | 'desc';

export type PriceSource = 'chainlink' | 'pyth' | 'ai_consensus' | 'aggregated';
