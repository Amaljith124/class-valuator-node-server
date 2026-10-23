const evaluationController = require("../controllers/evaluation");
const processController = require("../controllers/process");
const evaluationModel = require("../models/evaluation");
const processModel = require("../models/process");
const videoAnalysisManager = require("./videoAnalysisManager");

function submit(boss, body)
{
    return new Promise(function (resolve, reject)
    {
        const input = {
            objectKey: body.objectKey,
            inputType: body.inputType || "video",
            inputData: body.inputData || {},
            inputText: body.inputText
        };

        videoAnalysisManager.submit(boss, input)
            .then(function (rows)
            {
                resolve({
                    evaluation: evaluationModel.toApi(rows.evaluation),
                    process: processModel.toApi(rows.process)
                });
            })
            .catch(function (error)
            {
                console.error("[evaluationManager.submit] create queued evaluation failed", error);
                reject(error);
            });
    });
}

function get(id)
{
    return new Promise(function (resolve, reject)
    {
        evaluationController.getById(id)
            .then(function (row)
            {
                resolve(evaluationModel.toApi(row));
            })
            .catch(function (error)
            {
                console.error("[evaluationManager.get] load evaluation failed", {
                    evaluationId: id,
                    error: error
                });
                reject(error);
            });
    });
}

function list(query)
{
    return new Promise(function (resolve, reject)
    {
        const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
        const offset = Math.max(Number(query.offset) || 0, 0);

        evaluationController.list(limit, offset)
            .then(function (rows)
            {
                resolve(rows.map(evaluationModel.toApi));
            })
            .catch(function (error)
            {
                console.error("[evaluationManager.list] load evaluations failed", error);
                reject(error);
            });
    });
}

function getProcess(id)
{
    return new Promise(function (resolve, reject)
    {
        processController.getById(id)
            .then(function (row)
            {
                if (row)
                {
                    processController.logs(id)
                        .then(function (logs)
                        {
                            resolve(processModel.toApi(row, logs));
                        })
                        .catch(function (error)
                        {
                            console.error("[evaluationManager.getProcess] load process API logs failed", {
                                processId: id,
                                error: error
                            });
                            reject(error);
                        });
                }
                else
                {
                    resolve(null);
                }
            })
            .catch(function (error)
            {
                console.error("[evaluationManager.getProcess] load process failed", {
                    processId: id,
                    error: error
                });
                reject(error);
            });
    });
}

function listProcesses()
{
    return new Promise(function (resolve, reject)
    {
        processController.list()
            .then(function (rows)
            {
                const processPromises = rows.map(function (row)
                {
                    return new Promise(function (resolveProcess, rejectProcess)
                    {
                        processController.logs(row.processId)
                            .then(function (logs)
                            {
                                resolveProcess(processModel.toApi(row, logs.slice(-1)));
                            })
                            .catch(function (error)
                            {
                                console.error("[evaluationManager.listProcesses] load process API logs failed", {
                                    processId: row.processId,
                                    error: error
                                });
                                rejectProcess(error);
                            });
                    });
                });

                Promise.all(processPromises)
                    .then(function (processes)
                    {
                        resolve(processes);
                    })
                    .catch(function (error)
                    {
                        console.error("[evaluationManager.listProcesses] collect process summaries failed", error);
                        reject(error);
                    });
            })
            .catch(function (error)
            {
                console.error("[evaluationManager.listProcesses] load process records failed", error);
                reject(error);
            });
    });
}

function retry(boss, id)
{
    return new Promise(function (resolve, reject)
    {
        processController.getById(id)
            .then(function (row)
            {
                if (!row)
                {
                    reject({ message: "Process not found.", isClientError: true });
                }
                else if (row.status !== "failed")
                {
                    reject({ message: "Only failed processes can be retried.", isClientError: true });
                }
                else
                {
                    const payload = row.requestPayload || {};
                    const config = require("../config/appConfig");

                    processController.update(id, "queued", null, null)
                        .then(function ()
                        {
                            boss.send(config.queueName, {
                                evaluationId: row.evaluationId,
                                processId: id,
                                objectKey: payload.object_key,
                                stage: "full-analysis"
                            }, {
                                retryLimit: config.pgBossRetryLimit,
                                retryDelay: config.pgBossRetryDelaySeconds,
                                expireInSeconds: config.pgBossExpireSeconds
                            })
                                .then(function (jobId)
                                {
                                    processController.setJobId(id, jobId)
                                        .then(function ()
                                        {
                                            resolve({ process_id: id, status: "queued" });
                                        })
                                        .catch(function (error)
                                        {
                                            console.error("[evaluationManager.retry] save retry job ID failed", {
                                                processId: id,
                                                error: error
                                            });
                                            reject(error);
                                        });
                                })
                                .catch(function (error)
                                {
                                    console.error("[evaluationManager.retry] enqueue retry failed", {
                                        processId: id,
                                        error: error
                                    });
                                    reject(error);
                                });
                        })
                        .catch(function (error)
                        {
                            console.error("[evaluationManager.retry] reset process state failed", {
                                processId: id,
                                error: error
                            });
                            reject(error);
                        });
                }
            })
            .catch(function (error)
            {
                console.error("[evaluationManager.retry] load process before retry failed", {
                    processId: id,
                    error: error
                });
                reject(error);
            });
    });
}

module.exports = {
    submit: submit,
    get: get,
    list: list,
    getProcess: getProcess,
    listProcesses: listProcesses,
    retry: retry
};
