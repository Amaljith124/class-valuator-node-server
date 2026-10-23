const axios = require("axios");
const config = require("../config/appConfig");
const evaluationController = require("../controllers/evaluation");
const processController = require("../controllers/process");

const endpoints = {
    transcription: "/api/v1/test/transcription",
    "teaching-effectiveness": "/api/v1/test/teaching-effectiveness",
    "audio-quality": "/api/v1/test/audio-quality",
    "video-screen": "/api/v1/test/video-screen"
};

function safe(value)
{
    if (Array.isArray(value))
    {
        return value.map(safe);
    }
    else if (value && typeof value === "object")
    {
        return Object.keys(value).reduce(function (output, key)
        {
            const privateFields = ["text", "transcript", "quote", "evidence", "role_evidence"];

            if (privateFields.includes(key))
            {
                output[key] = "[redacted from process log]";
            }
            else
            {
                output[key] = safe(value[key]);
            }

            return output;
        }, {});
    }
    else
    {
        return value;
    }
}

function safeUrl(url)
{
    return String(url)
        .replace(/\/\/[^/@]*@/, "//")
        .split("?")[0]
        .split("#")[0];
}

function run(stage, objectKey, title)
{
    return new Promise(function (resolve, reject)
    {
        const endpoint = endpoints[stage];

        if (!endpoint)
        {
            reject({
                message: "Unknown test type.",
                isClientError: true
            });
        }
        else
        {
            const input = {
                objectKey: objectKey,
                inputType: "test",
                inputData: {
                    title: title || "Standalone " + stage + " test",
                    stage: stage
                }
            };

            evaluationController.create(input)
                .then(function (evaluation)
                {
                    processController.create(evaluation.evaluationId, {
                        object_key: objectKey,
                        stage: "standalone-" + stage
                    })
                        .then(function (processRow)
                        {
                            processController.update(processRow.processId, "processing", null, null)
                                .then(function ()
                                {
                                    sendStageRequest(stage, endpoint, objectKey, evaluation, processRow)
                                        .then(function (result)
                                        {
                                            resolve(result);
                                        })
                                        .catch(function (error)
                                        {
                                            console.error("[testingManager.run] execute standalone test failed", {
                                                processId: processRow.processId,
                                                evaluationId: evaluation.evaluationId,
                                                testType: stage,
                                                error: error
                                            });
                                            reject(error);
                                        });
                                })
                                .catch(function (error)
                                {
                                    console.error("[testingManager.run] mark test process processing failed", {
                                        processId: processRow.processId,
                                        evaluationId: evaluation.evaluationId,
                                        error: error
                                    });
                                    reject(error);
                                });
                        })
                        .catch(function (error)
                        {
                            console.error("[testingManager.run] create test process failed", {
                                evaluationId: evaluation.evaluationId,
                                error: error
                            });
                            reject(error);
                        });
                })
                .catch(function (error)
                {
                    console.error("[testingManager.run] create test evaluation failed", error);
                    reject(error);
                });
        }
    });
}

function sendStageRequest(stage, endpoint, objectKey, evaluation, processRow)
{
    return new Promise(function (resolve, reject)
    {
        const url = config.fastApiBaseUrl + endpoint;
        const safeRequestUrl = safeUrl(url);
        const request = {
            object_key: objectKey
        };
        const startedAt = new Date();
        const startedTime = Date.now();

        axios.post(url, request, {
            timeout: config.fastApiTimeoutMs,
            headers: {
                "x-internal-token": config.fastApiInternalToken
            }
        })
            .then(function (response)
            {
                const result = response.data.data || response.data;
                const safeResult = safe(result);
                const log = {
                    processId: processRow.processId,
                    evaluationId: evaluation.evaluationId,
                    attempt: 1,
                    stage: "standalone-" + stage,
                    method: "POST",
                    url: safeRequestUrl,
                    request: request,
                    status: response.status,
                    response: safeResult,
                    errorName: null,
                    errorMessage: null,
                    startedAt: startedAt,
                    completedAt: new Date(),
                    durationMs: Date.now() - startedTime
                };

                processController.logAttempt(log)
                    .then(function ()
                    {
                        processController.update(processRow.processId, "processed", safeResult, null)
                            .then(function ()
                            {
                                resolve({
                                    test_type: stage,
                                    status: "completed",
                                    message: "Test completed.",
                                    result: result
                                });
                            })
                            .catch(function (error)
                            {
                                console.error("[testingManager.sendStageRequest] save processed test status failed", {
                                    processId: processRow.processId,
                                    evaluationId: evaluation.evaluationId,
                                    error: error
                                });
                                reject(error);
                            });
                    })
                    .catch(function (error)
                    {
                        console.error("[testingManager.sendStageRequest] save successful test API log failed", {
                            processId: processRow.processId,
                            evaluationId: evaluation.evaluationId,
                            error: error
                        });
                        reject(error);
                    });
            })
            .catch(function (error)
            {
                console.error("[testingManager.sendStageRequest] FastAPI test request failed", {
                    processId: processRow.processId,
                    evaluationId: evaluation.evaluationId,
                    testType: stage,
                    status: error.response ? error.response.status : null,
                    errorName: String(error.code || error.name || "RequestError")
                });
                const responseBody = error.response ? error.response.data.data || error.response.data : null;
                const log = {
                    processId: processRow.processId,
                    evaluationId: evaluation.evaluationId,
                    attempt: 1,
                    stage: "standalone-" + stage,
                    method: "POST",
                    url: safeRequestUrl,
                    request: request,
                    status: error.response ? error.response.status : null,
                    response: responseBody ? safe(responseBody) : null,
                    errorName: String(error.code || error.name || "RequestError").slice(0, 120),
                    errorMessage: String(error.message || "FastAPI request failed").slice(0, 500),
                    startedAt: startedAt,
                    completedAt: new Date(),
                    durationMs: Date.now() - startedTime
                };

                processController.logAttempt(log)
                    .then(function ()
                    {
                        processController.update(
                            processRow.processId,
                            "failed",
                            null,
                            "Analysis test failed."
                        )
                            .then(function ()
                            {
                                reject({
                                    message: "Analysis test failed.",
                                    isClientError: false
                                });
                            })
                            .catch(function (statusError)
                            {
                                console.error("[testingManager.sendStageRequest] save failed test status failed", {
                                    processId: processRow.processId,
                                    evaluationId: evaluation.evaluationId,
                                    error: statusError
                                });
                                reject(error);
                            });
                    })
                    .catch(function (logError)
                    {
                        console.error("[testingManager.sendStageRequest] save failed test API log failed", {
                            processId: processRow.processId,
                            evaluationId: evaluation.evaluationId,
                            error: logError
                        });
                        reject(error);
                    });
            });
        });
}

module.exports = {
    run: run
};
