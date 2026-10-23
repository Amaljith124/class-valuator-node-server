const databaseRow = require("./databaseRow");

function formatLog(row)
{
    const type = row.errorName ? "error" : row.responseStatus ? "response" : "request";
    const responseText = row.responseStatus ? "HTTP " + row.responseStatus : "no response";

    return {
        attempt_number: row.attemptNumber,
        stage: row.stage,
        type: type,
        status: row.responseStatus,
        duration_ms: row.durationMs,
        started_at: row.startedAt,
        completed_at: row.completedAt,
        time: row.startedAt,
        message: row.errorMessage || "POST " + row.requestUrl + " · " + responseText + " · " + row.durationMs + " ms",
        request: row.requestBodyJson,
        response: row.responseBodyJson
    };
}

function formatDuration(durationMs)
{
    if (durationMs == null)
    {
        return "—";
    }
    else
    {
        const totalSeconds = Math.round(durationMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        if (minutes > 0)
        {
            return minutes + "m " + seconds + "s";
        }
        else
        {
            return totalSeconds + "s";
        }
    }
}

function toApi(row, logs)
{
    if (row)
    {
        const attempts = logs || [];
        const latest = attempts[attempts.length - 1];
        const duration = latest && latest.durationMs;
        const inputData = row.inputData || {};
        const stage = latest ? latest.stage : row.status === "processed" ? "Completed" : row.status;

        return {
            process_id: row.processId,
            evaluation_id: row.evaluationId,
            name: inputData.title || "Class recording analysis",
            status: row.status,
            stage: stage,
            created_at: row.createdDate,
            updated_at: row.updatedDate,
            completed_at: row.completedDate,
            duration: formatDuration(duration),
            error_message: row.errorMessage,
            request: latest ? latest.requestBodyJson : row.requestPayload,
            response: latest ? latest.responseBodyJson : row.responsePayload,
            status_code: latest && latest.responseStatus,
            logs: attempts.map(formatLog)
        };
    }
    else
    {
        return null;
    }
}

module.exports = {
    fromRow: databaseRow.toCamelCase,
    fromRows: databaseRow.toCamelCaseList,
    fromLogRows: databaseRow.toCamelCaseList,
    toApi: toApi
};
