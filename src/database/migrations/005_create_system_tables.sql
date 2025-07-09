-- Migration: 005_create_system_tables.sql
-- Create tables for system configuration, users, and API management

-- API keys and authentication
CREATE TABLE system.api_keys (
    id BIGSERIAL PRIMARY KEY,
    key_hash VARCHAR(64) UNIQUE NOT NULL,
    key_name VARCHAR(100) NOT NULL,
    user_id VARCHAR(100) NOT NULL,
    permissions JSONB NOT NULL DEFAULT '[]', -- Array of allowed endpoints/actions
    rate_limit_per_minute INTEGER DEFAULT 60,
    rate_limit_per_hour INTEGER DEFAULT 3600,
    rate_limit_per_day INTEGER DEFAULT 100000,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    usage_count BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users table
CREATE TABLE system.users (
    id VARCHAR(100) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255),
    plan_type VARCHAR(50) DEFAULT 'free',
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- System configuration
CREATE TABLE system.configuration (
    id BIGSERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    is_sensitive BOOLEAN DEFAULT false,
    category VARCHAR(50) DEFAULT 'general',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Oracle source configuration
CREATE TABLE system.oracle_sources (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    source_type VARCHAR(30) NOT NULL, -- 'chainlink', 'pyth', 'custom'
    is_enabled BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 1, -- Higher number = higher priority
    configuration JSONB NOT NULL,
    supported_symbols TEXT[], -- Array of supported symbols
    supported_chains TEXT[], -- Array of supported chains
    update_frequency_seconds INTEGER DEFAULT 60,
    timeout_seconds INTEGER DEFAULT 30,
    max_retry_attempts INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- WebSocket subscriptions tracking
CREATE TABLE system.websocket_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    connection_id VARCHAR(100) NOT NULL,
    user_id VARCHAR(100),
    subscription_type VARCHAR(50) NOT NULL, -- 'price', 'prediction', 'arbitrage'
    symbols TEXT[] NOT NULL,
    chains TEXT[],
    filters JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Feature flags
CREATE TABLE system.feature_flags (
    id BIGSERIAL PRIMARY KEY,
    flag_name VARCHAR(100) UNIQUE NOT NULL,
    is_enabled BOOLEAN DEFAULT false,
    rollout_percentage INTEGER DEFAULT 0, -- 0-100
    target_users TEXT[], -- Array of user IDs for targeted rollout
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Error logs
CREATE TABLE system.error_logs (
    id BIGSERIAL,
    service_name VARCHAR(50) NOT NULL,
    error_type VARCHAR(100) NOT NULL,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    request_id VARCHAR(100),
    user_id VARCHAR(100),
    endpoint VARCHAR(200),
    metadata JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (timestamp, service_name, error_type)
);

SELECT create_hypertable('system.error_logs', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    migrate_data => true
);

-- System health checks
CREATE TABLE system.health_checks (
    id BIGSERIAL,
    service_name VARCHAR(50) NOT NULL,
    check_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) CHECK (status IN ('healthy', 'degraded', 'unhealthy')) NOT NULL,
    response_time_ms INTEGER,
    details JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (timestamp, service_name, check_name)
);

SELECT create_hypertable('system.health_checks', 'timestamp',
    chunk_time_interval => INTERVAL '6 hours',
    migrate_data => true
);

-- Insert default configuration
INSERT INTO system.configuration (key, value, description, category) VALUES
('app.name', '"Reckon AI Indexer"', 'Application name', 'general'),
('app.version', '"1.0.0"', 'Application version', 'general'),
('app.environment', '"development"', 'Current environment', 'general'),
('rate_limits.default_per_minute', '60', 'Default rate limit per minute', 'rate_limiting'),
('rate_limits.default_per_hour', '3600', 'Default rate limit per hour', 'rate_limiting'),
('rate_limits.default_per_day', '100000', 'Default rate limit per day', 'rate_limiting'),
('oracles.refresh_interval_seconds', '30', 'How often to refresh oracle data', 'oracles'),
('oracles.max_price_deviation_percentage', '5.0', 'Maximum allowed price deviation between sources', 'oracles'),
('ai.min_miner_consensus', '3', 'Minimum miners required for consensus', 'ai'),
('ai.prediction_confidence_threshold', '0.6', 'Minimum confidence for AI predictions', 'ai'),
('websocket.max_connections_per_user', '10', 'Maximum WebSocket connections per user', 'websocket'),
('alerts.price_deviation_threshold', '10.0', 'Price deviation threshold for alerts (percentage)', 'alerts'),
('alerts.oracle_downtime_threshold_minutes', '5', 'Oracle downtime threshold for alerts', 'alerts');

-- Insert default oracle sources
INSERT INTO system.oracle_sources (name, source_type, configuration, supported_symbols, supported_chains) VALUES
('chainlink_ethereum', 'chainlink', 
 '{"network": "ethereum", "rpc_url": "https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"}',
 ARRAY['BTC', 'ETH', 'LINK', 'USDC', 'USDT'],
 ARRAY['ethereum']),
('chainlink_polygon', 'chainlink',
 '{"network": "polygon", "rpc_url": "https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY"}',
 ARRAY['BTC', 'ETH', 'MATIC', 'USDC', 'USDT'],
 ARRAY['polygon']),
('pyth_mainnet', 'pyth',
 '{"network": "mainnet", "endpoint": "https://hermes.pyth.network"}',
 ARRAY['BTC', 'ETH', 'SOL', 'AVAX', 'BNB', 'MATIC'],
 ARRAY['solana', 'ethereum', 'avalanche', 'bsc']);

-- Insert default feature flags
INSERT INTO system.feature_flags (flag_name, is_enabled, description) VALUES
('ai_predictions', true, 'Enable AI-powered price predictions'),
('arbitrage_detection', true, 'Enable arbitrage opportunity detection'),
('websocket_streaming', true, 'Enable WebSocket real-time streaming'),
('advanced_analytics', false, 'Enable advanced analytics features'),
('beta_features', false, 'Enable beta features for testing');

-- Indexes for system tables
CREATE INDEX idx_api_keys_user_id ON system.api_keys (user_id);
CREATE INDEX idx_api_keys_active ON system.api_keys (is_active);
CREATE INDEX idx_users_email ON system.users (email);
CREATE INDEX idx_users_active ON system.users (is_active);
CREATE INDEX idx_oracle_sources_enabled ON system.oracle_sources (is_enabled);
CREATE INDEX idx_websocket_subscriptions_connection ON system.websocket_subscriptions (connection_id);
CREATE INDEX idx_websocket_subscriptions_user ON system.websocket_subscriptions (user_id);
CREATE INDEX idx_feature_flags_enabled ON system.feature_flags (is_enabled);
CREATE INDEX idx_error_logs_service ON system.error_logs (service_name);
CREATE INDEX idx_health_checks_service ON system.health_checks (service_name, status);

-- Data retention policy for system logs
SELECT add_retention_policy('system.error_logs', INTERVAL '90 days');
SELECT add_retention_policy('system.health_checks', INTERVAL '30 days');

-- Create functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at columns
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON system.api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON system.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_configuration_updated_at BEFORE UPDATE ON system.configuration
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_oracle_sources_updated_at BEFORE UPDATE ON system.oracle_sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_websocket_subscriptions_updated_at BEFORE UPDATE ON system.websocket_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_feature_flags_updated_at BEFORE UPDATE ON system.feature_flags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
