CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS scripts
(
	file_name VARCHAR(255) PRIMARY KEY,
	script_number INTEGER NOT NULL,
	executed_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evaluation
(
	evaluation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	input_type VARCHAR(50) NOT NULL,
	input_data JSONB NOT NULL DEFAULT '{}'::jsonb,
	input_file_url TEXT,
	input_text TEXT,
	transcript TEXT,
	transcript_english TEXT,
	evaluation_result JSONB,
	status VARCHAR(20) NOT NULL DEFAULT 'pending',
	error_message TEXT,
	ai_provider VARCHAR(100),
	ai_model VARCHAR(100),
	created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	completed_date TIMESTAMPTZ,
	CONSTRAINT evaluation_status_check
		CHECK ( status IN ( 'pending', 'processing', 'completed', 'failed' ) )
);

CREATE INDEX IF NOT EXISTS idx_evaluation_created_date
	ON evaluation ( created_date DESC );

CREATE INDEX IF NOT EXISTS idx_evaluation_status
	ON evaluation ( status );

CREATE TABLE IF NOT EXISTS process
(
	process_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	evaluation_id UUID NOT NULL REFERENCES evaluation ( evaluation_id ) ON DELETE CASCADE,
	boss_job_id TEXT,
	status VARCHAR(20) NOT NULL DEFAULT 'queued',
	request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
	response_payload JSONB,
	error_message TEXT,
	created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	completed_date TIMESTAMPTZ,
	CONSTRAINT process_status_check
		CHECK ( status IN ( 'queued', 'processing', 'processed', 'failed' ) )
);

CREATE INDEX IF NOT EXISTS idx_process_evaluation_id
	ON process ( evaluation_id );

CREATE INDEX IF NOT EXISTS idx_process_status
	ON process ( status );

CREATE TABLE IF NOT EXISTS process_api_logs
(
	api_log_id BIGSERIAL PRIMARY KEY,
	process_id UUID NOT NULL REFERENCES process ( process_id ) ON DELETE CASCADE,
	evaluation_id UUID NOT NULL REFERENCES evaluation ( evaluation_id ) ON DELETE CASCADE,
	attempt_number INTEGER NOT NULL,
	stage VARCHAR(100) NOT NULL,
	request_method VARCHAR(10) NOT NULL,
	request_url TEXT NOT NULL,
	request_headers_redacted JSONB NOT NULL DEFAULT '{}'::jsonb,
	request_body_json JSONB,
	response_status INTEGER,
	response_body_json JSONB,
	error_name TEXT,
	error_message TEXT,
	started_at TIMESTAMPTZ NOT NULL,
	completed_at TIMESTAMPTZ,
	duration_ms INTEGER,
	CONSTRAINT process_api_logs_attempt_unique
		UNIQUE ( process_id, attempt_number )
);

CREATE INDEX IF NOT EXISTS idx_process_api_logs_process_id
	ON process_api_logs ( process_id, attempt_number );

---------------------------------------------------------------------------

INSERT INTO scripts
(
	file_name,
	script_number
)
VALUES (
	'0003.sql',
	3
)
ON CONFLICT ( file_name ) DO NOTHING;
---------------------------------------------------------------------------
