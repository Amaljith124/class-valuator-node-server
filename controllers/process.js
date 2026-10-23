const db = require("../database/db");
const processModel = require("../models/process");
const socketManager = require("../helpers/socketManager");

function create(evaluationId, payload)
{
    return new Promise(function (resolve, reject)
    {
        const sql = `
			INSERT INTO process ( evaluation_id, request_payload, status )
			VALUES ( $1, $2::jsonb, 'queued' )
			RETURNING
				process_id,
				evaluation_id,
				boss_job_id,
				status,
				request_payload,
				response_payload,
				error_message,
				created_date,
				updated_date,
				completed_date`;

        db.query(sql, [evaluationId, JSON.stringify(payload || {})])
            .then(function (result)
            {
                const processRow = processModel.fromRow(result.rows[0]);
                socketManager.emitProcessUpdate(processRow);
                resolve(processRow);
            })
            .catch(function (error)
            {
                console.error("[process.create] insert process failed", { evaluationId: evaluationId, error: error });
                reject(error);
            });
    });
}

function update(id, status, response, errorMessage)
{
    return new Promise(function (resolve, reject)
    {
        const sql = `
			UPDATE process
			SET status = $2::varchar,
				response_payload = $3::jsonb,
				error_message = $4,
				updated_date = NOW(),
				completed_date = CASE
					WHEN $2::varchar IN ( 'processed', 'failed' ) THEN NOW()
					ELSE completed_date
				END
			WHERE process_id = $1
			RETURNING
				process_id,
				evaluation_id,
				boss_job_id,
				status,
				request_payload,
				response_payload,
				error_message,
				created_date,
				updated_date,
				completed_date`;
        const responseJson = response === null ? null : JSON.stringify(response);

        db.query(sql, [id, status, responseJson, errorMessage || null])
            .then(function (result)
            {
                const processRow = processModel.fromRow(result.rows[0]);
                socketManager.emitProcessUpdate(processRow);
                resolve(processRow);
            })
            .catch(function (failure)
            {
                console.error("[process.update] update process state failed", { processId: id, error: failure });
                reject(failure);
            });
    });
}

function setJobId(id, jobId)
{
    return new Promise(function (resolve, reject)
    {
        const sql = `
			UPDATE process
			SET boss_job_id = $2,
				updated_date = NOW()
			WHERE process_id = $1
			RETURNING
				process_id,
				evaluation_id,
				boss_job_id,
				status,
				request_payload,
				response_payload,
				error_message,
				created_date,
				updated_date,
				completed_date`;

        db.query(sql, [id, jobId])
            .then(function (result)
            {
                resolve(processModel.fromRow(result.rows[0]));
            })
            .catch(function (error)
            {
                console.error("[process.setJobId] save pg-boss job ID failed", { processId: id, error: error });
                reject(error);
            });
    });
}

function getById(id)
{
    return new Promise(function (resolve, reject)
    {
        const sql = `
			SELECT
				process_id,
				evaluation_id,
				boss_job_id,
				status,
				request_payload,
				response_payload,
				error_message,
				created_date,
				updated_date,
				completed_date
			FROM process
			WHERE process_id = $1`;

        db.query(sql, [id])
            .then(function (result)
            {
                resolve(processModel.fromRow(result.rows[0]));
            })
            .catch(function (error)
            {
                console.error("[process.getById] select process failed", { processId: id, error: error });
                reject(error);
            });
    });
}

function list()
{
    return new Promise(function (resolve, reject)
    {
        const sql = `
			SELECT
				p.process_id,
				p.evaluation_id,
				p.boss_job_id,
				p.status,
				p.request_payload,
				p.response_payload,
				p.error_message,
				p.created_date,
				p.updated_date,
				p.completed_date,
				e.input_data,
				e.input_file_url
			FROM process p
			JOIN evaluation e USING ( evaluation_id )
			ORDER BY p.created_date DESC
			LIMIT 100`;

        db.query(sql)
            .then(function (result)
            {
                resolve(processModel.fromRows(result.rows));
            })
            .catch(function (error)
            {
                console.error("[process.list] select process list failed", error);
                reject(error);
            });
    });
}

function listQueuedJobs()
{
    return new Promise(function (resolve, reject)
    {
        const sql = `
			SELECT
				process_id,
				boss_job_id
			FROM process
			WHERE status = 'queued'
				AND boss_job_id IS NOT NULL
			ORDER BY created_date ASC`;

        db.query(sql)
            .then(function (result)
            {
                resolve(processModel.fromRows(result.rows));
            })
            .catch(function (error)
            {
                console.error("[process.listQueuedJobs] select queued process jobs failed", error);
                reject(error);
            });
    });
}

function nextAttempt(id)
{
    return new Promise(function (resolve, reject)
    {
        const sql = `
			SELECT COALESCE(MAX(attempt_number), 0) + 1 AS number
			FROM process_api_logs
			WHERE process_id = $1`;

        db.query(sql, [id])
            .then(function (result)
            {
                resolve(Number(result.rows[0].number));
            })
            .catch(function (error)
            {
                console.error("[process.nextAttempt] read attempt number failed", { processId: id, error: error });
                reject(error);
            });
    });
}

function logAttempt(row)
{
    return new Promise(function (resolve, reject)
    {
        const sql = `
			INSERT INTO process_api_logs (
				process_id,
				evaluation_id,
				attempt_number,
				stage,
				request_method,
				request_url,
				request_headers_redacted,
				request_body_json,
				response_status,
				response_body_json,
				error_name,
				error_message,
				started_at,
				completed_at,
				duration_ms
			)
			VALUES (
				$1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10::jsonb,
				$11, $12, $13, $14, $15
			)`;
        const values = [
            row.processId,
            row.evaluationId,
            row.attempt,
            row.stage,
            row.method,
            row.url,
            JSON.stringify({ "content-type": "application/json" }),
            JSON.stringify(row.request),
            row.status,
            row.response === null ? null : JSON.stringify(row.response),
            row.errorName,
            row.errorMessage,
            row.startedAt,
            row.completedAt,
            row.durationMs
        ];

        db.query(sql, values)
            .then(function ()
            {
                resolve(true);
            })
            .catch(function (error)
            {
                console.error("[process.logAttempt] insert API attempt failed", {
                    processId: row.processId,
                    attempt: row.attempt,
                    error: error
                });
                reject(error);
            });
    });
}

function logs(id)
{
    return new Promise(function (resolve, reject)
    {
        const sql = `
			SELECT
				attempt_number,
				stage,
				request_method,
				request_url,
				request_headers_redacted,
				request_body_json,
				response_status,
				response_body_json,
				error_name,
				error_message,
				started_at,
				completed_at,
				duration_ms
			FROM process_api_logs
			WHERE process_id = $1
			ORDER BY attempt_number`;

        db.query(sql, [id])
            .then(function (result)
            {
                resolve(processModel.fromLogRows(result.rows));
            })
            .catch(function (error)
            {
                console.error("[process.logs] select API attempts failed", { processId: id, error: error });
                reject(error);
            });
    });
}

module.exports = {
    create: create,
    update: update,
    setJobId: setJobId,
    getById: getById,
    list: list,
    listQueuedJobs: listQueuedJobs,
    nextAttempt: nextAttempt,
    logAttempt: logAttempt,
    logs: logs
};
