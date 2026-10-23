const axios = require("axios");
const config = require("../config/appConfig");
const evaluationController = require("../controllers/evaluation");
const processController = require("../controllers/process");

function safeBody(body)
{
    const serialized = JSON.stringify(body || {});

    if (serialized.length > 100000)
    {
        return {
            truncated: true,
            preview: serialized.slice(0, 100000)
        };
    }
    else
    {
        return JSON.parse(serialized);
    }
}

function safeUrl(url)
{
    return String(url)
        .replace(/\/\/[^/@]*@/, "//")
        .split("?")[0]
        .split("#")[0];
}

function safeResponse(body)
{
    const value = safeBody(body);

    if (value && value.data && typeof value.data.transcript === "string")
    {
        value.data.transcript = "[transcript stored on evaluation]";
    }
    else
    {
        // The response has no nested source transcript.
    }

    if (value && value.data && typeof value.data.transcript_english === "string")
    {
        value.data.transcript_english = "[English transcript stored on evaluation]";
    }
    else
    {
        // The response has no English transcript field.
    }

    if (value && value.transcript)
    {
        value.transcript = "[transcript stored on evaluation]";
    }
    else
    {
        // The response has no direct source transcript.
    }

    if (value && value.transcript_english)
    {
        value.transcript_english = "[English transcript stored on evaluation]";
    }
    else
    {
        // The response has no direct English transcript field.
    }

    if (value && value.data && value.data.result)
    {
        scrubResult(value.data.result);
    }
    else
    {
        // The response does not use the analysis response envelope.
    }

    if (value && value.result)
    {
        scrubResult(value.result);
    }
    else
    {
        // The response has no direct result field.
    }

    return value;
}

function scrubResult(result)
{
    if (result.transcription && Array.isArray(result.transcription.segments))
    {
        result.transcription.segments = result.transcription.segments.map(function (segment)
        {
            return {
                start: segment.start,
                end: segment.end,
                speaker_role: segment.speaker_role
            };
        });
    }
    else
    {
        // This result has no timestamped source transcription segments.
    }

    if (result.transcription_english)
    {
        result.transcription_english.text = "[English transcript stored on evaluation]";
        if (Array.isArray(result.transcription_english.segments))
        {
            result.transcription_english.segments = result.transcription_english.segments.map(function (segment)
            {
                return {
                    start: segment.start,
                    end: segment.end,
                    speaker_role: segment.speaker_role
                };
            });
        }
    }
    else
    {
        // This result has no English transcript.
    }
    if (result.criteria)
    {
        Object.keys(result.criteria).forEach(function (criterion)
        {
            result.criteria[criterion].evidence = "[redacted from process log]";
        });
    }
    else
    {
        // This result has no teaching criteria evidence.
    }
}

function submit(boss, input)
{
    return new Promise(function (resolve, reject)
    {
        if (!input || typeof input.objectKey !== "string" || !input.objectKey.trim())
        {
            reject({
                message: "objectKey is required.",
                isClientError: true
            });
        }
        else
        {
            evaluationController.create(input)
                .then(function (evaluation)
                {
                    processController.create(evaluation.evaluationId, {
                        object_key: input.objectKey
                    })
                        .then(function (processRow)
                        {
                            const job = {
                                evaluationId: evaluation.evaluationId,
                                processId: processRow.processId,
                                objectKey: input.objectKey,
                                stage: "full-analysis"
                            };

                            boss.send(config.queueName, job)
                                .then(function (jobId)
                                {
                                    if (jobId)
                                    {
                                        processController.setJobId(processRow.processId, jobId)
                                            .then(function ()
                                            {
                                                resolve({ evaluation: evaluation, process: processRow });
                                            })
                                            .catch(function (error)
                                            {
                                                console.error("[videoAnalysisManager.submit] save pg-boss job ID failed", {
                                                    processId: processRow.processId,
                                                    evaluationId: evaluation.evaluationId,
                                                    error: error
                                                });
                                                reject(error);
                                            });
                                    }
                                    else
                                    {
                                        console.error("[videoAnalysisManager.submit] pg-boss returned no job ID", {
                                            queueName: config.queueName,
                                            processId: processRow.processId,
                                            evaluationId: evaluation.evaluationId
                                        });

                                        const error = {
                                            message: "Queue submission failed.",
                                            isClientError: false
                                        };

                                        markQueueFailure(evaluation, processRow, error, reject);
                                    }
                                })
                                .catch(function (error)
                                {
                                    console.error("[videoAnalysisManager.submit] enqueue analysis job failed", {
                                        processId: processRow.processId,
                                        evaluationId: evaluation.evaluationId,
                                        error: error
                                    });
                                    markQueueFailure(evaluation, processRow, error, reject);
                                });
                        })
                        .catch(function (error)
                        {
                            console.error("[videoAnalysisManager.submit] create process record failed", {
                                evaluationId: evaluation.evaluationId,
                                error: error
                            });
                            reject(error);
                        });
                })
                .catch(function (error)
                {
                    console.error("[videoAnalysisManager.submit] create evaluation record failed", error);
                    reject(error);
                });
        }
    });
}

function markQueueFailure(evaluation, processRow, error, reject)
{
    return new Promise(function (resolve)
    {
        evaluationController.fail(evaluation.evaluationId, "Queue submission failed.")
            .then(function ()
            {
                processController.update(processRow.processId, "failed", null, "Queue submission failed.")
                    .then(function ()
                    {
                        reject(error);
                        resolve(true);
                    })
                    .catch(function (updateError)
                    {
                        console.error("[videoAnalysisManager.markQueueFailure] save failed process status failed", {
                            processId: processRow.processId,
                            evaluationId: evaluation.evaluationId,
                            error: updateError
                        });
                        reject(error);
                        resolve(false);
                    });
            })
            .catch(function (updateError)
            {
                console.error("[videoAnalysisManager.markQueueFailure] save failed evaluation status failed", {
                    evaluationId: evaluation.evaluationId,
                    error: updateError
                });
                reject(error);
                resolve(false);
            });
    });
}

function register(boss)
{
    return new Promise(function (resolve, reject)
    {
        boss.work(config.queueName, {
            batchSize: config.pgBossBatchSize,
            pollingIntervalSeconds: config.pgBossPollSeconds
        }, function (jobs)
        {
            return new Promise(function (resolveJobs, rejectJobs)
            {
                Promise.all(jobs.map(function (job)
                {
                    return processJob(job);
                }))
                    .then(function ()
                    {
                        resolveJobs(true);
                    })
                    .catch(function (error)
                    {
                        console.error("[videoAnalysisManager.register] process pg-boss job batch failed", {
                            queueName: config.queueName,
                            jobCount: jobs.length,
                            error: error
                        });
                        rejectJobs(error);
                    });
            });
        })
            .then(function ()
            {
                resolve(true);
            })
            .catch(function (error)
            {
                console.error("[videoAnalysisManager.register] register pg-boss worker failed", error);
                reject(error);
            });
    });
}

function recoverQueuedJobs(boss)
{
    return new Promise(function (resolve, reject)
    {
        processController.listQueuedJobs()
            .then(function (processRows)
            {
                const recoveryPromises = processRows.map(function (processRow)
                {
                    return new Promise(function (resolveRecovery)
                    {
                        boss.getJobById(config.queueName, processRow.bossJobId)
                            .then(function (job)
                            {
                                if (job && job.state === "failed")
                                {
                                    boss.retry(config.queueName, processRow.bossJobId)
                                        .then(function (retryCount)
                                        {
                                            console.log("[videoAnalysisManager.recoverQueuedJobs] retried failed queue job", {
                                                queueName: config.queueName,
                                                processId: processRow.processId,
                                                jobId: processRow.bossJobId,
                                                retryCount: retryCount
                                            });
                                            resolveRecovery(retryCount);
                                        })
                                        .catch(function (error)
                                        {
                                            console.error("[videoAnalysisManager.recoverQueuedJobs] retry failed queue job failed", {
                                                queueName: config.queueName,
                                                processId: processRow.processId,
                                                jobId: processRow.bossJobId,
                                                error: error
                                            });
                                            resolveRecovery(0);
                                        });
                                }
                                else
                                {
                                    resolveRecovery(0);
                                }
                            })
                            .catch(function (error)
                            {
                                console.error("[videoAnalysisManager.recoverQueuedJobs] load pg-boss job failed", {
                                    queueName: config.queueName,
                                    processId: processRow.processId,
                                    jobId: processRow.bossJobId,
                                    error: error
                                });
                                resolveRecovery(0);
                            });
                    });
                });

                Promise.all(recoveryPromises)
                    .then(function (retryCounts)
                    {
                        resolve(retryCounts.reduce(function (total, retryCount)
                        {
                            return total + retryCount;
                        }, 0));
                    })
                    .catch(function (error)
                    {
                        console.error("[videoAnalysisManager.recoverQueuedJobs] collect queued job recovery results failed", error);
                        reject(error);
                    });
            })
            .catch(function (error)
            {
                console.error("[videoAnalysisManager.recoverQueuedJobs] load queued process jobs failed", error);
                reject(error);
            });
    });
}

function processJob(job)
{
    return new Promise(function (resolve, reject)
    {
        const data = job.data;

        processController.update(data.processId, "processing", null, null)
            .then(function ()
            {
                evaluationController.markProcessing(data.evaluationId)
                    .then(function ()
                    {
                        processController.nextAttempt(data.processId)
                            .then(function (attempt)
                            {
                                callAnalysis(data, attempt)
                                    .then(function ()
                                    {
                                        resolve(true);
                                    })
                                    .catch(function (error)
                                    {
                                        console.error("[videoAnalysisManager.processJob] complete analysis call failed", {
                                            processId: data.processId,
                                            evaluationId: data.evaluationId,
                                            error: error
                                        });
                                        reject(error);
                                    });
                            })
                            .catch(function (error)
                            {
                                console.error("[videoAnalysisManager.processJob] get next attempt number failed", {
                                    processId: data.processId,
                                    evaluationId: data.evaluationId,
                                    error: error
                                });
                                markJobFailed(data, error, reject);
                            });
                    })
                    .catch(function (error)
                    {
                        console.error("[videoAnalysisManager.processJob] mark evaluation processing failed", {
                            processId: data.processId,
                            evaluationId: data.evaluationId,
                            error: error
                        });
                        markJobFailed(data, error, reject);
                    });
            })
            .catch(function (error)
            {
                console.error("[videoAnalysisManager.processJob] mark process processing failed", {
                    processId: data.processId,
                    evaluationId: data.evaluationId,
                    error: error
                });
                markJobFailed(data, error, reject);
            });
    });
}

function callAnalysis(data, attempt)
{
    return new Promise(function (resolve, reject)
    {
        const startedAt = new Date();
        const startedTime = Date.now();
        const url = config.fastApiBaseUrl + "/api/v1/analyze";
        const request = {
            object_key: data.objectKey,
            evaluation_id: data.evaluationId
        };

        axios.post(url, request, {
            timeout: config.fastApiTimeoutMs,
            headers: {
                "x-internal-token": config.fastApiInternalToken
            }
        })
            .then(function (response)
            {
                const log = {
                    processId: data.processId,
                    evaluationId: data.evaluationId,
                    attempt: attempt,
                    stage: data.stage || "full-analysis",
                    method: "POST",
                    url: safeUrl(url),
                    request: request,
                    status: response.status,
                    response: safeResponse(response.data),
                    errorName: null,
                    errorMessage: null,
                    startedAt: startedAt,
                    completedAt: new Date(),
                    durationMs: Date.now() - startedTime
                };

                processController.logAttempt(log)
                    .then(function ()
                    {
                        const result = response.data.data;

                        evaluationController.complete(
                            data.evaluationId,
                            result.result,
                            result.transcript,
                            result.transcript_english,
                            result.provider || "Google Gemini",
                            result.model || null
                        )
                            .then(function ()
                            {
                                processController.update(
                                    data.processId,
                                    "processed",
                                    safeResponse(response.data),
                                    null
                                )
                                    .then(function ()
                                    {
                                        resolve(true);
                                    })
                                    .catch(function (error)
                                    {
                                        console.error("[videoAnalysisManager.callAnalysis] save processed status failed", {
                                            processId: data.processId,
                                            evaluationId: data.evaluationId,
                                            error: error
                                        });
                                        markJobFailed(data, error, reject);
                                    });
                            })
                            .catch(function (error)
                            {
                                console.error("[videoAnalysisManager.callAnalysis] save evaluation result failed", {
                                    processId: data.processId,
                                    evaluationId: data.evaluationId,
                                    error: error
                                });
                                markJobFailed(data, error, reject);
                            });
                    })
                    .catch(function (error)
                    {
                        console.error("[videoAnalysisManager.callAnalysis] persist successful API attempt failed", {
                            processId: data.processId,
                            evaluationId: data.evaluationId,
                            attempt: attempt,
                            error: error
                        });
                        markJobFailed(data, error, reject);
                    });
            })
            .catch(function (error)
            {
                console.error("[videoAnalysisManager.callAnalysis] FastAPI request failed", {
                    processId: data.processId,
                    evaluationId: data.evaluationId,
                    attempt: attempt,
                    status: error.response ? error.response.status : null,
                    errorName: String(error.code || error.name || "RequestError")
                });
                const responseBody = error.response ? safeResponse(error.response.data) : null;
                const log = {
                    processId: data.processId,
                    evaluationId: data.evaluationId,
                    attempt: attempt,
                    stage: data.stage || "full-analysis",
                    method: "POST",
                    url: safeUrl(url),
                    request: request,
                    status: error.response ? error.response.status : null,
                    response: responseBody,
                    errorName: String(error.code || error.name || "RequestError").slice(0, 120),
                    errorMessage: String(error.message || "FastAPI request failed").slice(0, 500),
                    startedAt: startedAt,
                    completedAt: new Date(),
                    durationMs: Date.now() - startedTime
                };

                processController.logAttempt(log)
                    .then(function ()
                    {
                        markJobFailed(data, error, reject);
                    })
                    .catch(function (logError)
                    {
                        console.error("[videoAnalysisManager.callAnalysis] persist failed API attempt failed", {
                            processId: data.processId,
                            evaluationId: data.evaluationId,
                            attempt: attempt,
                            error: logError
                        });
                        markJobFailed(data, error, reject);
                    });
            });
        });
}

function markJobFailed(data, originalError, rejectJob)
{
    return new Promise(function (resolve, reject)
    {
        evaluationController.fail(data.evaluationId, "Analysis failed; check process logs.")
            .then(function ()
            {
                processController.update(
                    data.processId,
                    "failed",
                    null,
                    "Analysis failed; check process logs."
                )
                    .then(function ()
                    {
                        rejectJob(originalError);
                        resolve(true);
                    })
                    .catch(function (error)
                    {
                        console.error("[videoAnalysisManager.markJobFailed] save failed process status failed", {
                            processId: data.processId,
                            evaluationId: data.evaluationId,
                            error: error
                        });
                        rejectJob(originalError);
                        resolve(false);
                    });
            })
            .catch(function (error)
            {
                console.error("[videoAnalysisManager.markJobFailed] save failed evaluation status failed", {
                    processId: data.processId,
                    evaluationId: data.evaluationId,
                    error: error
                });
                rejectJob(originalError);
                resolve(false);
            });
    });
}

module.exports = {
    submit: submit,
    register: register,
    recoverQueuedJobs: recoverQueuedJobs
};
