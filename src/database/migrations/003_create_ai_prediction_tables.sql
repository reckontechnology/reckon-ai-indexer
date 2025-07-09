-- Migration: 003_create_ai_prediction_tables.sql
-- Create tables for AI predictions and sentiment data

-- Bittensor miner predictions
CREATE TABLE ai_predictions.miner_predictions (
    id BIGSERIAL,
    miner_hotkey VARCHAR(100) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    prediction_1h DECIMAL(20, 8),
    prediction_24h DECIMAL(20, 8),
    sentiment VARCHAR(10) CHECK (sentiment IN ('bullish', 'bearish', 'neutral')),
    confidence DECIMAL(5, 4) NOT NULL,
    risk_score DECIMAL(5, 4),
    miner_stake DECIMAL(20, 8),
    reasoning TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (timestamp, miner_hotkey, symbol)
);

SELECT create_hypertable('ai_predictions.miner_predictions', 'timestamp',
    chunk_time_interval => INTERVAL '2 hours',
    migrate_data => true
);

-- Consensus predictions
CREATE TABLE ai_predictions.consensus_predictions (
    id BIGSERIAL,
    symbol VARCHAR(20) NOT NULL,
    weighted_prediction_1h DECIMAL(20, 8) NOT NULL,
    weighted_prediction_24h DECIMAL(20, 8),
    consensus_sentiment VARCHAR(10) CHECK (consensus_sentiment IN ('bullish', 'bearish', 'neutral')),
    consensus_confidence DECIMAL(5, 4) NOT NULL,
    consensus_risk_score DECIMAL(5, 4),
    participating_miners INTEGER NOT NULL,
    total_stake DECIMAL(30, 8) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (timestamp, symbol)
);

SELECT create_hypertable('ai_predictions.consensus_predictions', 'timestamp',
    chunk_time_interval => INTERVAL '1 hour',
    migrate_data => true
);

-- Sentiment analysis data
CREATE TABLE ai_predictions.sentiment_analysis (
    id BIGSERIAL,
    symbol VARCHAR(20) NOT NULL,
    sentiment VARCHAR(10) CHECK (sentiment IN ('bullish', 'bearish', 'neutral')),
    score DECIMAL(5, 4) NOT NULL,
    confidence DECIMAL(5, 4) NOT NULL,
    social_mentions INTEGER,
    news_sentiment DECIMAL(5, 4),
    sources JSONB NOT NULL, -- Array of data sources
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (timestamp, symbol)
);

SELECT create_hypertable('ai_predictions.sentiment_analysis', 'timestamp',
    chunk_time_interval => INTERVAL '1 hour',
    migrate_data => true
);

-- Miner performance tracking
CREATE TABLE ai_predictions.miner_performance (
    id BIGSERIAL,
    miner_hotkey VARCHAR(100) NOT NULL,
    symbol VARCHAR(20),
    prediction_accuracy DECIMAL(5, 4),
    total_predictions INTEGER DEFAULT 0,
    correct_predictions INTEGER DEFAULT 0,
    avg_confidence DECIMAL(5, 4),
    stake_amount DECIMAL(20, 8),
    rank_position INTEGER,
    trust_score DECIMAL(5, 4),
    evaluation_period_start TIMESTAMPTZ NOT NULL,
    evaluation_period_end TIMESTAMPTZ NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (timestamp, miner_hotkey, symbol)
);

SELECT create_hypertable('ai_predictions.miner_performance', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    migrate_data => true
);

-- Prediction accuracy tracking
CREATE TABLE ai_predictions.prediction_results (
    id BIGSERIAL,
    prediction_id BIGINT,
    symbol VARCHAR(20) NOT NULL,
    predicted_price DECIMAL(20, 8) NOT NULL,
    actual_price DECIMAL(20, 8),
    prediction_timeframe VARCHAR(10) NOT NULL, -- '1h', '24h'
    accuracy_percentage DECIMAL(8, 4),
    prediction_timestamp TIMESTAMPTZ NOT NULL,
    evaluation_timestamp TIMESTAMPTZ NOT NULL,
    miner_hotkey VARCHAR(100),
    is_consensus BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (evaluation_timestamp, symbol, prediction_timeframe, miner_hotkey)
);

SELECT create_hypertable('ai_predictions.prediction_results', 'evaluation_timestamp',
    chunk_time_interval => INTERVAL '1 day',
    migrate_data => true
);

-- Indexes for AI prediction tables
CREATE INDEX idx_miner_predictions_hotkey ON ai_predictions.miner_predictions (miner_hotkey);
CREATE INDEX idx_miner_predictions_symbol ON ai_predictions.miner_predictions (symbol);
CREATE INDEX idx_consensus_predictions_symbol ON ai_predictions.consensus_predictions (symbol);
CREATE INDEX idx_sentiment_symbol ON ai_predictions.sentiment_analysis (symbol);
CREATE INDEX idx_miner_performance_hotkey ON ai_predictions.miner_performance (miner_hotkey);
CREATE INDEX idx_prediction_results_symbol ON ai_predictions.prediction_results (symbol);

-- Data retention policies for AI data
SELECT add_retention_policy('ai_predictions.miner_predictions', INTERVAL '90 days');
SELECT add_retention_policy('ai_predictions.consensus_predictions', INTERVAL '1 year');
SELECT add_retention_policy('ai_predictions.sentiment_analysis', INTERVAL '30 days');
SELECT add_retention_policy('ai_predictions.miner_performance', INTERVAL '1 year');
SELECT add_retention_policy('ai_predictions.prediction_results', INTERVAL '1 year');
