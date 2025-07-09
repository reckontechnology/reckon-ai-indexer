-- Migration: 001_create_timescale_extension.sql
-- Enable TimescaleDB extension

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Create schemas for organizing tables
CREATE SCHEMA IF NOT EXISTS price_data;
CREATE SCHEMA IF NOT EXISTS ai_predictions;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS system;
