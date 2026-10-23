const databaseRow = require("./databaseRow");

function toApi(row)
{
    if (row)
    {
        const result = row.evaluationResult || {};
        const inputData = row.inputData || {};
        const weights = result.weights || {};
        const criteria = Object.entries(result.criteria || {}).map(function (entry)
        {
            const name = entry[0];
            const item = entry[1];

            return {
                name: name,
                score: item.score,
                weight: Math.round((weights[name] || 0) * 100),
                evidence: item.evidence || []
            };
        });

        return {
            evaluation_id: row.evaluationId,
            title: inputData.title || "Class recording analysis",
            teacher: inputData.teacher || "",
            subject: inputData.subject || "",
            date: row.createdDate,
            duration: result.transcription && result.transcription.duration,
            status: row.status,
            overall_score: result.overall_score,
            teaching_score: result.overall_score,
            audio_score: result.audio_quality && result.audio_quality.score,
            video_score: result.video_screen_analysis && result.video_screen_analysis.score,
            coverage: result.score_coverage == null ? null : Math.round(result.score_coverage * 100),
            summary: result.summary || "",
            criteria: criteria,
            transcript: row.transcript,
            transcript_english: row.transcriptEnglish,
            evaluation_result: result,
            error_message: row.errorMessage
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
    toApi: toApi
};
