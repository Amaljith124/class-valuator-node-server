const router = require("express").Router();
const multer = require("multer");
const config = require("../../config/appConfig");
const uploadManager = require("../../helpers/uploadManager");
const testingManager = require("../../helpers/testingManager");
const response = require("../../helpers/responseManager");

const ingest = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: config.maxUploadMb * 1024 * 1024
    }
});

router.post("/:type", ingest.single("file"), function (req, res)
{
    if (!req.file)
    {
        response.failure(res, {
            message: "Recording file is required.",
            isClientError: true
        });
    }
    else
    {
        uploadManager.store(req.file)
            .then(function (objectKey)
            {
                testingManager.run(req.params.type, objectKey, req.body.title)
                    .then(function (data)
                    {
                        response.successWithData(res, data, "Test completed.");
                    })
                    .catch(function (error)
                    {
                        console.error("[testingRouter.post] run standalone test failed", {
                            testType: req.params.type,
                            error: error
                        });
                        response.failure(res, error);
                    });
            })
            .catch(function (error)
            {
                console.error("[testingRouter.post] store test media failed", error);
                response.failure(res, error);
            });
    }
});

module.exports = router;
