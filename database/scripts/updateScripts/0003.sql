ALTER TABLE evaluation
	ADD COLUMN IF NOT EXISTS transcript_english TEXT;

---------------------------------------------------------------------------

INSERT INTO scripts
(
	file_name,
	script_number
)
VALUES
(
	'0003.sql',
	3
);
