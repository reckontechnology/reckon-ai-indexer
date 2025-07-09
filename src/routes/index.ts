import { Router } from 'express';
import { PriceController } from '../controllers/price-controller';

export const apiRouter = Router();

// Price endpoints
apiRouter.get('/prices/:chain/:asset', PriceController.getSinglePrice);
apiRouter.post('/prices/batch', PriceController.getBatchPrices);
apiRouter.get('/prices/:chain/:asset/history', PriceController.getPriceHistory);

// Market data endpoints
apiRouter.get('/markets/overview', PriceController.getMarketOverview);
apiRouter.get('/markets/trending', PriceController.getTrendingAssets);

// AI and analytics endpoints (general)
apiRouter.get('/ai/predictions/:asset', PriceController.getAIPredictions);
apiRouter.get('/analytics/sentiment/:asset', PriceController.getSentimentAnalysis);

// Bittensor Subnet 18 specific endpoints
apiRouter.get('/bittensor/prediction/:symbol', PriceController.getBittensorPrediction);
apiRouter.get('/bittensor/sentiment/:symbol', PriceController.getBittensorSentiment);
apiRouter.get('/bittensor/miners', PriceController.getActiveMiners);
apiRouter.get('/bittensor/network-stats', PriceController.getBittensorStats);

// Network information
apiRouter.get('/networks', PriceController.getSupportedNetworks);
apiRouter.get('/networks/:chain/assets', PriceController.getNetworkAssets);
