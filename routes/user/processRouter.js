const router = require("express").Router();
const response = require("../../helpers/responseManager");
const evaluationManager = require("../../helpers/evaluationManager");

module.exports = function (boss)
{
    router.get("/", function (req, res)
    {
        evaluationManager.listProcesses()
            .then(function (data)
            {
                response.successWithData(res, data);
            })
            .catch(function (error)
            {
                console.error("[processRouter.list] load process list failed", error);
                response.failure(res, error);
            });
    });

    router.get("/:id", function (req, res)
    {
        evaluationManager.getProcess(req.params.id)
            .then(function (data)
            {
                if (data)
                {
                    response.successWithData(res, data);
                }
                else
                {
                    response.notFound(res, "Process not found.");
                }
            })
            .catch(function (error)
            {
                console.error("[processRouter.get] load process details failed", {
                    processId: req.params.id,
                    error: error
                });
                response.failure(res, error);
            });
    });

    router.post("/:id/retry", function (req, res)
    {
        evaluationManager.retry(boss, req.params.id)
            .then(function (data)
            {
                response.successWithData(res, data, "Process requeued.");
            })
            .catch(function (error)
            {
                console.error("[processRouter.retry] retry process failed", {
                    processId: req.params.id,
                    error: error
                });
                response.failure(res, error);
            });
    });

    return router;
};
