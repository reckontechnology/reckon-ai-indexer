import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Logger } from '../utils/logger';
import { JwtPayload, ReckonError } from '../types';

const logger = new Logger('AuthMiddleware');

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
  apiKey?: string;
}

export const authMiddleware = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] as string;

    // Check for API key first
    if (apiKey) {
      // For now, we'll implement a simple API key validation
      // In production, this should check against a database
      if (isValidApiKey(apiKey)) {
        req.apiKey = apiKey;
        return next();
      } else {
        throw new ReckonError('Invalid API key', 'INVALID_API_KEY', 401);
      }
    }

    // Check for JWT token
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const secret = process.env['JWT_SECRET'];
      
      if (!secret) {
        throw new ReckonError('JWT secret not configured', 'JWT_SECRET_MISSING', 500);
      }

      try {
        const decoded = jwt.verify(token, secret) as JwtPayload;
        req.user = decoded;
        return next();
      } catch (jwtError) {
        throw new ReckonError('Invalid or expired token', 'INVALID_TOKEN', 401);
      }
    }

    // No authentication provided
    throw new ReckonError('Authentication required', 'AUTH_REQUIRED', 401);

  } catch (error) {
    logger.error('Authentication failed:', error);
    next(error);
  }
};

// Middleware for optional authentication (allows anonymous access)
export const optionalAuthMiddleware = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] as string;

    // Check for API key
    if (apiKey && isValidApiKey(apiKey)) {
      req.apiKey = apiKey;
      return next();
    }

    // Check for JWT token
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const secret = process.env['JWT_SECRET'];
      
      if (secret) {
        try {
          const decoded = jwt.verify(token, secret) as JwtPayload;
          req.user = decoded;
        } catch (jwtError) {
          // Invalid token, but continue as anonymous
          logger.debug('Invalid token in optional auth, continuing as anonymous');
        }
      }
    }

    // Continue without authentication
    next();
  } catch (error) {
    logger.error('Optional authentication error:', error);
    next();
  }
};

// Simple API key validation (replace with database lookup in production)
function isValidApiKey(apiKey: string): boolean {
  // This is a placeholder implementation
  // In production, you would check against a database
  const validKeys = [
    'demo-key-12345',
    'test-key-67890',
    'dev-key-abcdef'
  ];
  
  return validKeys.includes(apiKey) || apiKey.startsWith('rck_');
}
