-- Migration: 004_create_analytics_tables.sql
-- Create tables for analytics, metrics, and system monitoring

-- API usage analytics
CREATE TABLE analytics.api_usage (
    id BIGSERIAL,
    endpoint VARCHAR(200) NOT NULL,
    method VARCHAR(10) NOT NULL,
    user_id VARCHAR(100),
    api_key_hash VARCHAR(64),
    response_time_ms INTEGER,
    status_code INTEGER NOT NULL,
    ip_address INET,
    user_agent TEXT,
    request_size INTEGER,
    response_size INTEGER,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (timestamp, endpoint, user_id)
);

SELECT create_hypertable('analytics.api_usage', 'timestamp',
    chunk_time_interval => INTERVAL '4 hours',
    migrate_data => true
);

-- System metrics
CREATE TABLE analytics.system_metrics (
    id BIGSERIAL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(20, 8) NOT NULL,
    metric_unit VARCHAR(20),
    service_name VARCHAR(50) NOT NULL,
    instance_id VARCHAR(100),
    tags JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (timestamp, metric_name, service_name)
);

SELECT create_hypertable('analytics.system_metrics', 'timestamp',
    chunk_time_interval => INTERVAL '2 hours',
    migrate_data => true
);

-- Price analytics and statistics
CREATE TABLE analytics.price_statistics (
    id BIGSERIAL,
    symbol VARCHAR(20) NOT NULL,
    chain VARCHAR(50) NOT NULL,
    timeframe VARCHAR(10) NOT NULL, -- '1h', '24h', '7d', '30d'
    avg_price DECIMAL(20, 8),
    min_price DECIMAL(20, 8),
    max_price DECIMAL(20, 8),
    volatility DECIMAL(10, 6),
    volume DECIMAL(30, 8),
    price_change DECIMAL(10, 6),
    price_change_percentage DECIMAL(8, 4),
    total_arbitrage_opportunities INTEGER DEFAULT 0,
    avg_arbitrage_spread DECIMAL(8, 4),
    data_quality_score DECIMAL(5, 4),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (timestamp, symbol, chain, timeframe)
);

SELECT create_hypertable('analytics.price_statistics', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    migrate_data => true
);

-- Oracle performance metrics
CREATE TABLE analytics.oracle_performance (
    id BIGSERIAL,
    oracle_name VARCHAR(50) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    update_frequency_seconds INTEGER,
    avg_response_time_ms INTEGER,
    uptime_percentage DECIMAL(5, 4),
    error_rate DECIMAL(5, 4),
    price_accuracy DECIMAL(5, 4),
    total_updates INTEGER DEFAULT 0,
    failed_updates INTEGER DEFAULT 0,
    last_update_timestamp TIMESTAMPTZ,
    evaluation_period_start TIMESTAMPTZ NOT NULL,
    evaluation_period_end TIMESTAMPTZ NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (timestamp, oracle_name, symbol)
);

SELECT create_hypertable('analytics.oracle_performance', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    migrate_data => true
);

-- Alert events
CREATE TABLE analytics.alert_events (
    id BIGSERIAL,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    symbol VARCHAR(20),
    source VARCHAR(50),
    threshold_value DECIMAL(20, 8),
    actual_value DECIMAL(20, 8),
    metadata JSONB,
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (timestamp, alert_type, symbol)
);

SELECT create_hypertable('analytics.alert_events', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    migrate_data => true
);

-- Continuous aggregates for better query performance
CREATE MATERIALIZED VIEW analytics.hourly_price_summary
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 hour', timestamp) AS hour,
    symbol,
    chain,
    COUNT(*) AS price_count,
    AVG(unified_price) AS avg_price,
    MIN(unified_price) AS min_price,
    MAX(unified_price) AS max_price,
    STDDEV(unified_price) AS price_volatility,
    AVG(confidence) AS avg_confidence,
    AVG(source_count) AS avg_source_count
FROM price_data.unified_prices
GROUP BY hour, symbol, chain;

CREATE MATERIALIZED VIEW analytics.daily_api_summary
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 day', timestamp) AS day,
    endpoint,
    COUNT(*) AS request_count,
    COUNT(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 END) AS success_count,
    COUNT(CASE WHEN status_code >= 400 THEN 1 END) AS error_count,
    AVG(response_time_ms) AS avg_response_time,
    COUNT(DISTINCT user_id) AS unique_users
FROM analytics.api_usage
GROUP BY day, endpoint;

-- Refresh policies for continuous aggregates
SELECT add_continuous_aggregate_policy('analytics.hourly_price_summary',
    start_offset => INTERVAL '2 hours',
    end_offset => INTERVAL '10 minutes',
    schedule_interval => INTERVAL '10 minutes');

SELECT add_continuous_aggregate_policy('analytics.daily_api_summary',
    start_offset => INTERVAL '1 day',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');

-- Indexes for analytics tables
CREATE INDEX idx_api_usage_endpoint ON analytics.api_usage (endpoint);
CREATE INDEX idx_api_usage_user_id ON analytics.api_usage (user_id);
CREATE INDEX idx_system_metrics_service ON analytics.system_metrics (service_name);
CREATE INDEX idx_price_statistics_symbol_timeframe ON analytics.price_statistics (symbol, timeframe);
CREATE INDEX idx_oracle_performance_oracle_symbol ON analytics.oracle_performance (oracle_name, symbol);
CREATE INDEX idx_alert_events_type_severity ON analytics.alert_events (alert_type, severity);
CREATE INDEX idx_alert_events_resolved ON analytics.alert_events (is_resolved);

-- Data retention policies for analytics
SELECT add_retention_policy('analytics.api_usage', INTERVAL '90 days');
SELECT add_retention_policy('analytics.system_metrics', INTERVAL '30 days');
SELECT add_retention_policy('analytics.price_statistics', INTERVAL '2 years');
SELECT add_retention_policy('analytics.oracle_performance', INTERVAL '1 year');
SELECT add_retention_policy('analytics.alert_events', INTERVAL '6 months');
