const router = require("express").Router();
const response = require("../../helpers/responseManager");
const config = require("../../config/appConfig");

router.get("/", function (req, res)
{
    response.successWithData(res, { name: config.appName }, "API is running");
});

router.get("/health", function (req, res)
{
    response.successWithData(res, { status: "ok" }, "Healthy");
});

module.exports = router;
