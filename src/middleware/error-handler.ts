import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger';
import { ReckonError } from '../types';

const logger = new Logger('ErrorHandler');

export const errorHandler = (
  error: Error | ReckonError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error('Error handler triggered:', error);

  // Handle custom ReckonError
  if (error instanceof ReckonError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      },
      metadata: {
        timestamp: Date.now(),
        request_id: req.headers['x-request-id'] || 'unknown',
        path: req.path,
        method: req.method
      }
    });
    return;
  }

  // Handle validation errors
  if (error.name === 'ValidationError') {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.message
      },
      metadata: {
        timestamp: Date.now(),
        request_id: req.headers['x-request-id'] || 'unknown',
        path: req.path,
        method: req.method
      }
    });
    return;
  }

  // Handle rate limit errors
  if (error.message.includes('Too many requests')) {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
        details: error.message
      },
      metadata: {
        timestamp: Date.now(),
        request_id: req.headers['x-request-id'] || 'unknown',
        path: req.path,
        method: req.method
      }
    });
    return;
  }

  // Handle generic errors
  const status = 500;
  const message = process.env['NODE_ENV'] === 'production' 
    ? 'Internal server error' 
    : error.message;

  res.status(status).json({
    error: {
      code: 'INTERNAL_ERROR',
      message,
      details: process.env['NODE_ENV'] === 'production' ? undefined : error.stack
    },
    metadata: {
      timestamp: Date.now(),
      request_id: req.headers['x-request-id'] || 'unknown',
      path: req.path,
      method: req.method
    }
  });
};
