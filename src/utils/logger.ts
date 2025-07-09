import { createWriteStream, WriteStream } from 'fs';
import { join } from 'path';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

export interface LogEntry {
  timestamp: string;
  level: string;
  service: string;
  message: string;
  data?: any;
  error?: Error;
}

export class Logger {
  private service: string;
  private logLevel: LogLevel;
  private logStream?: WriteStream;

  constructor(service: string) {
    this.service = service;
    this.logLevel = this.getLogLevel();
    
    if (process.env['NODE_ENV'] === 'production') {
      this.initFileLogging();
    }
  }

  private getLogLevel(): LogLevel {
    const level = process.env['LOG_LEVEL']?.toUpperCase() || 'INFO';
    return LogLevel[level as keyof typeof LogLevel] ?? LogLevel.INFO;
  }

  private initFileLogging(): void {
    try {
      const logDir = join(process.cwd(), 'logs');
      const logFile = join(logDir, `app-${new Date().toISOString().split('T')[0]}.log`);
      this.logStream = createWriteStream(logFile, { flags: 'a' });
    } catch (error) {
      console.error('Failed to initialize file logging:', error);
    }
  }

  private formatMessage(level: string, message: string, data?: any, error?: Error): string {
    const timestamp = new Date().toISOString();
    const logEntry: LogEntry = {
      timestamp,
      level,
      service: this.service,
      message,
      data,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } as any : undefined
    };

    return JSON.stringify(logEntry);
  }

  private log(level: LogLevel, levelName: string, message: string, data?: any, error?: Error): void {
    if (level > this.logLevel) return;

    const formattedMessage = this.formatMessage(levelName, message, data, error);
    
    // Console output with colors
    const colors = {
      ERROR: '\x1b[31m', // Red
      WARN: '\x1b[33m',  // Yellow
      INFO: '\x1b[36m',  // Cyan
      DEBUG: '\x1b[35m', // Magenta
      TRACE: '\x1b[37m'  // White
    };
    
    const color = colors[levelName as keyof typeof colors] || '';
    const reset = '\x1b[0m';
    
    console.log(`${color}[${new Date().toISOString()}] ${levelName} [${this.service}]: ${message}${reset}`);
    
    if (data) {
      console.log(`${color}Data:${reset}`, JSON.stringify(data, null, 2));
    }
    
    if (error) {
      console.error(`${color}Error:${reset}`, error);
    }

    // File output
    if (this.logStream) {
      this.logStream.write(formattedMessage + '\n');
    }
  }

  public error(message: string, error?: Error | any, data?: any): void {
    this.log(LogLevel.ERROR, 'ERROR', message, data, error);
  }

  public warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, 'WARN', message, data);
  }

  public info(message: string, data?: any): void {
    this.log(LogLevel.INFO, 'INFO', message, data);
  }

  public debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, data);
  }

  public trace(message: string, data?: any): void {
    this.log(LogLevel.TRACE, 'TRACE', message, data);
  }

  public close(): void {
    if (this.logStream) {
      this.logStream.end();
    }
  }
}
