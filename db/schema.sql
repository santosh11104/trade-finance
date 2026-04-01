CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(128) NOT NULL UNIQUE,
    password_hash VARCHAR(256) NOT NULL,
    role VARCHAR(32) NOT NULL,
    org_msp VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_metadata (
    id VARCHAR(64) PRIMARY KEY,
    importer VARCHAR(128),
    exporter VARCHAR(128),
    issuing_bank VARCHAR(128),
    advising_bank VARCHAR(128),
    amount NUMERIC(20,2),
    currency VARCHAR(16),
    status VARCHAR(32),
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    last_event VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    lc_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    event_payload JSONB,
    source VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
