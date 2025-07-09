import WebSocket from 'ws';
import { Server } from 'http';
import { Logger } from '../utils/logger';
import { WebSocketMessage } from '../types';
import { UnifiedPriceEngine } from '../services/unified-price-engine';
import { wsRateLimitMiddleware } from '../middleware/rate-limit-middleware';

export class WebSocketManager {
  private wss: WebSocket.Server;
  private logger: Logger;
  private priceEngine: UnifiedPriceEngine;
  private subscriptions: Map<WebSocket, Set<string>>;
  private rateLimiter: any;

  constructor(server: Server) {
    this.logger = new Logger('WebSocketManager');
    this.priceEngine = new UnifiedPriceEngine();
    this.subscriptions = new Map();
    this.rateLimiter = wsRateLimitMiddleware(100, 1000);

    this.wss = new WebSocket.Server({
      server,
      path: '/api/v1/ws',
      verifyClient: (info: any) => {
        // Basic rate limiting check
        return this.rateLimiter(null, info.req);
      }
    });

    this.logger.info('WebSocket server initialized');
  }

  public async initialize(): Promise<void> {
    this.setupEventHandlers();
    this.startHeartbeat();
    this.logger.info('WebSocket manager initialized successfully');
  }

  private setupEventHandlers(): void {
    this.wss.on('connection', (ws, req) => {
      const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
      this.logger.info(`WebSocket connection established: ${clientId}`);

      // Initialize subscription set for this client
      this.subscriptions.set(ws, new Set());

      // Handle incoming messages
      ws.on('message', (data) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          this.logger.error('Invalid WebSocket message:', error);
          this.sendError(ws, 'Invalid message format');
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        this.logger.info(`WebSocket connection closed: ${clientId}`);
        this.subscriptions.delete(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        this.logger.error(`WebSocket error for ${clientId}:`, error);
      });

      // Send welcome message
      this.sendMessage(ws, {
        type: 'heartbeat',
        payload: {
          message: 'Connected to Reckon AI Indexer WebSocket',
          timestamp: Date.now(),
          server_time: new Date().toISOString()
        },
        timestamp: Date.now()
      });
    });

    this.wss.on('error', (error) => {
      this.logger.error('WebSocket server error:', error);
    });
  }

  private async handleMessage(ws: WebSocket, message: WebSocketMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'subscribe':
          await this.handleSubscribe(ws, message);
          break;
        
        case 'unsubscribe':
          await this.handleUnsubscribe(ws, message);
          break;
        
        default:
          this.sendError(ws, `Unknown message type: ${message.type}`);
      }
    } catch (error) {
      this.logger.error('Error handling WebSocket message:', error);
      this.sendError(ws, 'Internal server error');
    }
  }

  private async handleSubscribe(ws: WebSocket, message: WebSocketMessage): Promise<void> {
    const { symbol, chain } = message.payload || {};
    
    if (!symbol || !chain) {
      this.sendError(ws, 'Symbol and chain are required for subscription');
      return;
    }

    const subscriptionKey = `${chain}:${symbol}`;
    const clientSubscriptions = this.subscriptions.get(ws);
    
    if (clientSubscriptions) {
      clientSubscriptions.add(subscriptionKey);
      
      const messageWithOptionalRequestId = {
        type: 'subscribe' as const,
        payload: {
          status: 'subscribed',
          symbol,
          chain,
          subscription_key: subscriptionKey
        },
        timestamp: Date.now(),
        ...(message.request_id && { request_id: message.request_id })
      };
      
      this.sendMessage(ws, messageWithOptionalRequestId);

      // Send initial price data
      try {
        const priceData = await this.priceEngine.getUnifiedPrice(symbol, chain);
        this.sendMessage(ws, {
          type: 'price_update',
          payload: priceData,
          timestamp: Date.now()
        });
      } catch (error) {
        this.logger.error(`Failed to get initial price for ${subscriptionKey}:`, error);
      }

      this.logger.debug(`Client subscribed to ${subscriptionKey}`);
    }
  }

  private async handleUnsubscribe(ws: WebSocket, message: WebSocketMessage): Promise<void> {
    const { symbol, chain } = message.payload || {};
    
    if (!symbol || !chain) {
      this.sendError(ws, 'Symbol and chain are required for unsubscription');
      return;
    }

    const subscriptionKey = `${chain}:${symbol}`;
    const clientSubscriptions = this.subscriptions.get(ws);
    
    if (clientSubscriptions) {
      clientSubscriptions.delete(subscriptionKey);
      
      const messageWithOptionalRequestId = {
        type: 'unsubscribe' as const,
        payload: {
          status: 'unsubscribed',
          symbol,
          chain,
          subscription_key: subscriptionKey
        },
        timestamp: Date.now(),
        ...(message.request_id && { request_id: message.request_id })
      };
      
      this.sendMessage(ws, messageWithOptionalRequestId);

      this.logger.debug(`Client unsubscribed from ${subscriptionKey}`);
    }
  }

  private sendMessage(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, errorMessage: string): void {
    this.sendMessage(ws, {
      type: 'error',
      payload: {
        error: errorMessage,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    });
  }

  private startHeartbeat(): void {
    const heartbeatInterval = parseInt(process.env['WS_HEARTBEAT_INTERVAL'] || '30000', 10);
    
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          this.sendMessage(ws, {
            type: 'heartbeat',
            payload: {
              server_time: new Date().toISOString(),
              connected_clients: this.wss.clients.size,
              uptime: process.uptime()
            },
            timestamp: Date.now()
          });
        }
      });
    }, heartbeatInterval);

    this.logger.debug(`Heartbeat started with ${heartbeatInterval}ms interval`);
  }

  public broadcastPriceUpdate(symbol: string, chain: string, priceData: any): void {
    const subscriptionKey = `${chain}:${symbol}`;
    
    this.subscriptions.forEach((clientSubscriptions, ws) => {
      if (clientSubscriptions.has(subscriptionKey) && ws.readyState === WebSocket.OPEN) {
        this.sendMessage(ws, {
          type: 'price_update',
          payload: priceData,
          timestamp: Date.now()
        });
      }
    });
  }

  public getConnectionCount(): number {
    return this.wss.clients.size;
  }

  public getActiveSubscriptions(): number {
    let total = 0;
    this.subscriptions.forEach((subscriptions) => {
      total += subscriptions.size;
    });
    return total;
  }
}
