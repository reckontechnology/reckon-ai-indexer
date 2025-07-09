-- Migration: 002_create_price_tables.sql
-- Create tables for price data with TimescaleDB hypertables

-- Main price data table
CREATE TABLE price_data.price_feeds (
    id BIGSERIAL,
    symbol VARCHAR(20) NOT NULL,
    chain VARCHAR(50) NOT NULL,
    price DECIMAL(20, 8) NOT NULL,
    confidence DECIMAL(5, 4),
    source VARCHAR(50) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (timestamp, symbol, chain, source)
);

-- Convert to hypertable (time-series optimized)
SELECT create_hypertable('price_data.price_feeds', 'timestamp', 
    chunk_time_interval => INTERVAL '1 hour',
    migrate_data => true
);

-- Unified price aggregations
CREATE TABLE price_data.unified_prices (
    id BIGSERIAL,
    symbol VARCHAR(20) NOT NULL,
    chain VARCHAR(50) NOT NULL,
    unified_price DECIMAL(20, 8) NOT NULL,
    confidence DECIMAL(5, 4) NOT NULL,
    source_count INTEGER NOT NULL,
    price_deviation DECIMAL(10, 6),
    arbitrage_count INTEGER DEFAULT 0,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sources JSONB NOT NULL, -- Array of contributing sources
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (timestamp, symbol, chain)
);

SELECT create_hypertable('price_data.unified_prices', 'timestamp',
    chunk_time_interval => INTERVAL '1 hour',
    migrate_data => true
);

-- Arbitrage opportunities
CREATE TABLE price_data.arbitrage_opportunities (
    id BIGSERIAL,
    symbol VARCHAR(20) NOT NULL,
    buy_source VARCHAR(50) NOT NULL,
    sell_source VARCHAR(50) NOT NULL,
    buy_price DECIMAL(20, 8) NOT NULL,
    sell_price DECIMAL(20, 8) NOT NULL,
    spread_percentage DECIMAL(8, 4) NOT NULL,
    profit_potential DECIMAL(20, 8) NOT NULL,
    confidence DECIMAL(5, 4) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'active',
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (timestamp, symbol, buy_source, sell_source)
);

SELECT create_hypertable('price_data.arbitrage_opportunities', 'timestamp',
    chunk_time_interval => INTERVAL '30 minutes',
    migrate_data => true
);

-- OHLCV aggregations for charting
CREATE TABLE price_data.ohlcv_1m (
    symbol VARCHAR(20) NOT NULL,
    chain VARCHAR(50) NOT NULL,
    open_price DECIMAL(20, 8) NOT NULL,
    high_price DECIMAL(20, 8) NOT NULL,
    low_price DECIMAL(20, 8) NOT NULL,
    close_price DECIMAL(20, 8) NOT NULL,
    volume DECIMAL(30, 8) DEFAULT 0,
    trade_count INTEGER DEFAULT 0,
    timestamp TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (timestamp, symbol, chain)
);

SELECT create_hypertable('price_data.ohlcv_1m', 'timestamp',
    chunk_time_interval => INTERVAL '6 hours',
    migrate_data => true
);

-- Create additional OHLCV tables for different timeframes
CREATE TABLE price_data.ohlcv_5m (LIKE price_data.ohlcv_1m INCLUDING ALL);
CREATE TABLE price_data.ohlcv_15m (LIKE price_data.ohlcv_1m INCLUDING ALL);
CREATE TABLE price_data.ohlcv_1h (LIKE price_data.ohlcv_1m INCLUDING ALL);
CREATE TABLE price_data.ohlcv_4h (LIKE price_data.ohlcv_1m INCLUDING ALL);
CREATE TABLE price_data.ohlcv_1d (LIKE price_data.ohlcv_1m INCLUDING ALL);

SELECT create_hypertable('price_data.ohlcv_5m', 'timestamp', chunk_time_interval => INTERVAL '1 day');
SELECT create_hypertable('price_data.ohlcv_15m', 'timestamp', chunk_time_interval => INTERVAL '3 days');
SELECT create_hypertable('price_data.ohlcv_1h', 'timestamp', chunk_time_interval => INTERVAL '1 week');
SELECT create_hypertable('price_data.ohlcv_4h', 'timestamp', chunk_time_interval => INTERVAL '2 weeks');
SELECT create_hypertable('price_data.ohlcv_1d', 'timestamp', chunk_time_interval => INTERVAL '1 month');

-- Indexes for better query performance
CREATE INDEX idx_price_feeds_symbol_chain ON price_data.price_feeds (symbol, chain);
CREATE INDEX idx_price_feeds_source ON price_data.price_feeds (source);
CREATE INDEX idx_unified_prices_symbol_chain ON price_data.unified_prices (symbol, chain);
CREATE INDEX idx_arbitrage_symbol_status ON price_data.arbitrage_opportunities (symbol, status);
CREATE INDEX idx_ohlcv_symbol_chain ON price_data.ohlcv_1m (symbol, chain);

-- Data retention policies (keep raw data for 30 days, aggregated for longer)
SELECT add_retention_policy('price_data.price_feeds', INTERVAL '30 days');
SELECT add_retention_policy('price_data.arbitrage_opportunities', INTERVAL '7 days');
SELECT add_retention_policy('price_data.ohlcv_1m', INTERVAL '7 days');
SELECT add_retention_policy('price_data.ohlcv_5m', INTERVAL '30 days');
SELECT add_retention_policy('price_data.ohlcv_15m', INTERVAL '90 days');
-- Higher timeframes kept longer (1h+ kept indefinitely for now)
