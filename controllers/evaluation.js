const db = require("../database/db");
const evaluationModel = require("../models/evaluation");

function create(input)
{
    return new Promise(function (resolve, reject)
    {
        const sql = `
			INSERT INTO evaluation ( input_type, input_data, input_file_url, input_text, status )
			VALUES ( $1, $2::jsonb, $3, $4, 'pending' )
			RETURNING
				evaluation_id,
				input_type,
				input_data,
				input_file_url,
				input_text,
				transcript,
				transcript_english,
				evaluation_result,
				status,
				error_message,
				ai_provider,
				ai_model,
				created_date,
				updated_date,
				completed_date`;
        const values = [
            input.inputType,
            JSON.stringify(input.inputData || {}),
            input.objectKey || null,
            input.inputText || null
        ];

        db.query(sql, values)
            .then(function (result)
            {
                resolve(evaluationModel.fromRow(result.rows[0]));
            })
            .catch(function (error)
            {
                console.error("[evaluation.create] insert evaluation failed", error);
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
				evaluation_id,
				input_type,
				input_data,
				input_file_url,
				input_text,
				transcript,
				transcript_english,
				evaluation_result,
				status,
				error_message,
				ai_provider,
				ai_model,
				created_date,
				updated_date,
				completed_date
			FROM evaluation
			WHERE evaluation_id = $1`;

        db.query(sql, [id])
            .then(function (result)
            {
                resolve(evaluationModel.fromRow(result.rows[0]));
            })
            .catch(function (error)
            {
                console.error("[evaluation.getById] select evaluation failed", { evaluationId: id, error: error });
                reject(error);
            });
    });
}

function list(limit, offset)
{
    return new Promise(function (resolve, reject)
    {
        const sql = `
			SELECT
				evaluation_id,
				input_type,
				input_data,
				input_file_url,
				input_text,
				transcript,
				transcript_english,
				evaluation_result,
				status,
				error_message,
				ai_provider,
				ai_model,
				created_date,
				updated_date,
				completed_date
			FROM evaluation
			ORDER BY created_date DESC
			LIMIT $1
			OFFSET $2`;

        db.query(sql, [limit, offset])
            .then(function (result)
            {
                resolve(evaluationModel.fromRows(result.rows));
            })
            .catch(function (error)
            {
                console.error("[evaluation.list] select evaluations failed", error);
                reject(error);
            });
    });
}

function markProcessing(id)
{
    return new Promise(function (resolve, reject)
    {
        const sql = `
			UPDATE evaluation
			SET status = 'processing',
				updated_date = NOW()
			WHERE evaluation_id = $1
			RETURNING
				evaluation_id,
				input_type,
				input_data,
				input_file_url,
				input_text,
				transcript,
				transcript_english,
				evaluation_result,
				status,
				error_message,
				ai_provider,
				ai_model,
				created_date,
				updated_date,
				completed_date`;

        db.query(sql, [id])
            .then(function (result)
            {
                resolve(evaluationModel.fromRow(result.rows[0]));
            })
            .catch(function (error)
            {
                console.error("[evaluation.markProcessing] update status failed", { evaluationId: id, error: error });
                reject(error);
            });
    });
}

function complete(id, data, transcript, transcriptEnglish, provider, model)
{
    return new Promise(function (resolve, reject)
    {
        const sql = `
			UPDATE evaluation
			SET status = 'completed',
				evaluation_result = $2::jsonb,
				transcript = $3,
				transcript_english = $4,
				ai_provider = $5,
				ai_model = $6,
				error_message = NULL,
				updated_date = NOW(),
				completed_date = NOW()
			WHERE evaluation_id = $1
			RETURNING
				evaluation_id,
				input_type,
				input_data,
				input_file_url,
				input_text,
				transcript,
				transcript_english,
				evaluation_result,
				status,
				error_message,
				ai_provider,
				ai_model,
				created_date,
				updated_date,
				completed_date`;
		const values = [id, JSON.stringify(data), transcript || null, transcriptEnglish || null, provider || null, model || null];

        db.query(sql, values)
            .then(function (result)
            {
                resolve(evaluationModel.fromRow(result.rows[0]));
            })
            .catch(function (error)
            {
                console.error("[evaluation.complete] save completed result failed", { evaluationId: id, error: error });
                reject(error);
            });
    });
}

function fail(id, message)
{
    return new Promise(function (resolve, reject)
    {
        const sql = `
			UPDATE evaluation
			SET status = 'failed',
				error_message = $2,
				updated_date = NOW(),
				completed_date = NOW()
			WHERE evaluation_id = $1
			RETURNING
				evaluation_id,
				input_type,
				input_data,
				input_file_url,
				input_text,
				transcript,
				transcript_english,
				evaluation_result,
				status,
				error_message,
				ai_provider,
				ai_model,
				created_date,
				updated_date,
				completed_date`;

        db.query(sql, [id, message])
            .then(function (result)
            {
                resolve(evaluationModel.fromRow(result.rows[0]));
            })
            .catch(function (error)
            {
                console.error("[evaluation.fail] save failed status failed", { evaluationId: id, error: error });
                reject(error);
            });
    });
}

module.exports = {
    create: create,
    getById: getById,
    list: list,
    markProcessing: markProcessing,
    complete: complete,
    fail: fail
};
