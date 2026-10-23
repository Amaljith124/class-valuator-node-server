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
VALUES
(
	'0002.sql',
	2
);
---------------------------------------------------------------------------
