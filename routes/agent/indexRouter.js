const router = require("express").Router();
const videoAnalysisRouter = require("./videoAnalysisRouter");

module.exports = function (boss)
{
    router.use("/video-analysis", videoAnalysisRouter(boss));

    return router;
};
