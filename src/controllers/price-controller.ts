import { Request, Response } from 'express';
import { ChainlinkService } from '../services/chainlink-service';
import { PythService } from '../services/pyth-service';
import { UnifiedPriceEngine } from '../services/unified-price-engine';
import { BittensorService } from '../services/bittensor-service';
import { AuthenticatedRequest } from '../middleware/auth-middleware';
import { Logger } from '../utils/logger';
import { ReckonError, BatchPriceRequest } from '../types';

const logger = new Logger('PriceController');

export class PriceController {
  private static chainlinkService = new ChainlinkService();
  private static pythService = new PythService();
  private static unifiedEngine = new UnifiedPriceEngine();
  private static bittensorService = new BittensorService();

  public static async getSinglePrice(req: Request, res: Response): Promise<void> {
    try {
      const { chain, asset } = req.params;
      
      if (!chain || !asset) {
        throw new ReckonError('Chain and asset parameters are required', 'MISSING_PARAMETERS', 400);
      }

      const startTime = Date.now();
      const priceData = await PriceController.unifiedEngine.getUnifiedPrice(asset, chain);
      const processingTime = Date.now() - startTime;

      res.json({
        success: true,
        data: priceData,
        metadata: {
          timestamp: Date.now(),
          request_id: req.headers['x-request-id'] || 'unknown',
          processing_time_ms: processingTime,
          api_version: '1.0'
        }
      });

    } catch (error) {
      logger.error('Failed to get single price:', error);
      throw error;
    }
  }

  public static async getBatchPrices(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const batchRequest = req.body as BatchPriceRequest;
      
      if (!batchRequest.requests || !Array.isArray(batchRequest.requests)) {
        throw new ReckonError('Invalid batch request format', 'INVALID_BATCH_FORMAT', 400);
      }

      const startTime = Date.now();
      const promises = batchRequest.requests.map(request => 
        PriceController.unifiedEngine.getUnifiedPrice(request.symbol, request.chain)
      );

      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.length - successful;
      const processingTime = Date.now() - startTime;

      const response = {
        request_id: req.headers['x-request-id'] || 'batch_' + Date.now(),
        results: results.map(result => 
          result.status === 'fulfilled' ? result.value : null
        ).filter(Boolean),
        total_requests: batchRequest.requests.length,
        successful,
        failed,
        processing_time_ms: processingTime
      };

      res.json({
        success: true,
        data: response
      });

    } catch (error) {
      logger.error('Failed to get batch prices:', error);
      throw error;
    }
  }

  public static async getPriceHistory(req: Request, res: Response): Promise<void> {
    try {
      const { chain, asset } = req.params;
      const { timeframe = '1h' } = req.query;

      // Placeholder implementation
      res.json({
        success: true,
        data: {
          symbol: asset,
          chain,
          timeframe,
          data: [],
          message: 'Historical data endpoint - coming soon'
        }
      });

    } catch (error) {
      logger.error('Failed to get price history:', error);
      throw error;
    }
  }

  public static async getMarketOverview(_req: Request, res: Response): Promise<void> {
    try {
      // Placeholder implementation
      res.json({
        success: true,
        data: {
          total_market_cap: 0,
          total_volume_24h: 0,
          bitcoin_dominance: 0,
          message: 'Market overview endpoint - coming soon'
        }
      });

    } catch (error) {
      logger.error('Failed to get market overview:', error);
      throw error;
    }
  }

  public static async getTrendingAssets(_req: Request, res: Response): Promise<void> {
    try {
      // Placeholder implementation
      res.json({
        success: true,
        data: {
          trending: [],
          message: 'Trending assets endpoint - coming soon'
        }
      });

    } catch (error) {
      logger.error('Failed to get trending assets:', error);
      throw error;
    }
  }

  public static async getAIPredictions(req: Request, res: Response): Promise<void> {
    try {
      const { asset } = req.params;

      // Placeholder implementation
      res.json({
        success: true,
        data: {
          asset,
          prediction_1h: 0,
          sentiment: 'neutral',
          confidence: 0,
          message: 'AI predictions endpoint - coming soon'
        }
      });

    } catch (error) {
      logger.error('Failed to get AI predictions:', error);
      throw error;
    }
  }

  public static async getSentimentAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const { asset } = req.params;

      // Placeholder implementation
      res.json({
        success: true,
        data: {
          asset,
          sentiment: 'neutral',
          score: 0,
          message: 'Sentiment analysis endpoint - coming soon'
        }
      });

    } catch (error) {
      logger.error('Failed to get sentiment analysis:', error);
      throw error;
    }
  }

  public static async getSupportedNetworks(_req: Request, res: Response): Promise<void> {
    try {
      const chainlinkNetworks = PriceController.chainlinkService.getSupportedNetworks();
      const pythNetworks = PriceController.pythService.getSupportedNetworks();
      
      const allNetworks = [...new Set([...chainlinkNetworks, ...pythNetworks])];

      res.json({
        success: true,
        data: {
          networks: allNetworks,
          chainlink_networks: chainlinkNetworks,
          pyth_networks: pythNetworks,
          total_count: allNetworks.length
        }
      });

    } catch (error) {
      logger.error('Failed to get supported networks:', error);
      throw error;
    }
  }

  public static async getNetworkAssets(req: Request, res: Response): Promise<void> {
    try {
      const { chain } = req.params;
      
      const chainlinkPairs = PriceController.chainlinkService.getSupportedPairs(chain);
      const pythSymbols = PriceController.pythService.getSupportedSymbols();

      res.json({
        success: true,
        data: {
          chain,
          chainlink_pairs: chainlinkPairs,
          pyth_symbols: pythSymbols.filter(s => s.includes('USD')),
          total_assets: chainlinkPairs.length
        }
      });

    } catch (error) {
      logger.error('Failed to get network assets:', error);
      throw error;
    }
  }

  /**
   * Get Bittensor AI prediction for a symbol
   */
  public static async getBittensorPrediction(req: Request, res: Response): Promise<void> {
    try {
      const { symbol } = req.params;
      
      if (!symbol) {
        throw new ReckonError('Symbol parameter is required', 'MISSING_PARAMETERS', 400);
      }

      const prediction = await PriceController.bittensorService.getAIPrediction(symbol.toUpperCase());
      
      if (!prediction) {
        throw new ReckonError('Prediction not available for this symbol', 'PREDICTION_NOT_FOUND', 404);
      }

      res.json({
        success: true,
        data: prediction,
        metadata: {
          timestamp: Date.now(),
          request_id: req.headers['x-request-id'] || 'unknown',
          source: 'bittensor_subnet_18',
          api_version: '1.0'
        }
      });

    } catch (error) {
      logger.error('Failed to get Bittensor prediction:', error);
      throw error;
    }
  }

  /**
   * Get Bittensor sentiment analysis for a symbol
   */
  public static async getBittensorSentiment(req: Request, res: Response): Promise<void> {
    try {
      const { symbol } = req.params;
      
      if (!symbol) {
        throw new ReckonError('Symbol parameter is required', 'MISSING_PARAMETERS', 400);
      }

      const sentiment = await PriceController.bittensorService.getSentiment(symbol.toUpperCase());
      
      if (!sentiment) {
        throw new ReckonError('Sentiment data not available for this symbol', 'SENTIMENT_NOT_FOUND', 404);
      }

      res.json({
        success: true,
        data: sentiment,
        metadata: {
          timestamp: Date.now(),
          request_id: req.headers['x-request-id'] || 'unknown',
          source: 'bittensor_subnet_18',
          api_version: '1.0'
        }
      });

    } catch (error) {
      logger.error('Failed to get Bittensor sentiment:', error);
      throw error;
    }
  }

  /**
   * Get active Bittensor miners
   */
  public static async getActiveMiners(req: Request, res: Response): Promise<void> {
    try {
      const miners = await PriceController.bittensorService.getActiveMiners();

      res.json({
        success: true,
        data: {
          miners,
          total_count: miners.length,
          active_count: miners.filter((m: any) => m.active).length
        },
        metadata: {
          timestamp: Date.now(),
          request_id: req.headers['x-request-id'] || 'unknown',
          source: 'bittensor_subnet_18',
          api_version: '1.0'
        }
      });

    } catch (error) {
      logger.error('Failed to get active miners:', error);
      throw error;
    }
  }

  /**
   * Get Bittensor network statistics
   */
  public static async getBittensorStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await PriceController.bittensorService.getNetworkStats();

      res.json({
        success: true,
        data: stats,
        metadata: {
          timestamp: Date.now(),
          request_id: req.headers['x-request-id'] || 'unknown',
          source: 'bittensor_subnet_18',
          api_version: '1.0'
        }
      });

    } catch (error) {
      logger.error('Failed to get network stats:', error);
      throw error;
    }
  }
}
