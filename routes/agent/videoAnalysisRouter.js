const router = require("express").Router();
const response = require("../../helpers/responseManager");
const evaluationManager = require("../../helpers/evaluationManager");

module.exports = function (boss)
{
    router.post("/", function (req, res)
    {
        evaluationManager.submit(boss, req.body)
            .then(function (data)
            {
                response.created(res, data, "Video analysis queued.");
            })
            .catch(function (error)
            {
                console.error("[videoAnalysisRouter.post] submit evaluation failed", error);
                response.failure(res, error);
            });
    });

    return router;
};
