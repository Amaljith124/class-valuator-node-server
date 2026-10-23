const router = require("express").Router();
const evaluationRouter = require("./evaluationRouter");
const processRouter = require("./processRouter");
const testingRouter = require("./testingRouter");

module.exports = function (boss)
{
    router.use("/evaluations", evaluationRouter);
    router.use("/processes", processRouter(boss));
    router.use("/testing", testingRouter);

    return router;
};
