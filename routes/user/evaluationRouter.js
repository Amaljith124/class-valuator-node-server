const router = require("express").Router();
const response = require("../../helpers/responseManager");
const evaluationManager = require("../../helpers/evaluationManager");
const multer = require("multer");
const config = require("../../config/appConfig");
const uploadManager = require("../../helpers/uploadManager");

const ingest = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: config.maxUploadMb * 1024 * 1024
    },
    fileFilter: function (req, file, callback)
    {
        if (/^video\//.test(file.mimetype) || /^audio\//.test(file.mimetype))
        {
            callback(null, true);
        }
        else
        {
            callback(new Error("Only audio or video recordings are accepted."));
        }
    }
});

router.get("/", function (req, res)
{
    evaluationManager.list(req.query)
        .then(function (data)
        {
            response.successWithData(res, data);
        })
        .catch(function (error)
        {
            console.error("[evaluationRouter.list] load evaluation list failed", error);
            response.failure(res, error);
        });
});

router.post("/upload", ingest.single("file"), function (req, res)
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
                const input = {
                    objectKey: objectKey,
                    inputType: req.file.mimetype.startsWith("audio/") ? "audio" : "video",
                    inputData: {
                        title: req.body.title || req.file.originalname,
                        teacher: req.body.teacher || "",
                        subject: req.body.subject || "",
                        notes: req.body.notes || "",
                        fileName: req.file.originalname,
                        mimeType: req.file.mimetype,
                        fileSize: req.file.size
                    }
                };

                evaluationManager.submit(req.app.locals.boss, input)
                    .then(function (data)
                    {
                        response.created(res, {
                            evaluation_id: data.evaluation.evaluation_id,
                            process_id: data.process.process_id,
                            status: "queued"
                        }, "Recording queued.");
                    })
                    .catch(function (error)
                    {
                        console.error("[evaluationRouter.upload] queue recording failed", error);
                        response.failure(res, error);
                    });
            })
            .catch(function (error)
            {
                console.error("[evaluationRouter.upload] store recording failed", error);
                response.failure(res, error);
            });
    }
});

router.get("/:id", function (req, res)
{
    evaluationManager.get(req.params.id)
        .then(function (data)
        {
            if (data)
            {
                response.successWithData(res, data);
            }
            else
            {
                response.notFound(res, "Evaluation not found.");
            }
        })
        .catch(function (error)
        {
            console.error("[evaluationRouter.get] load evaluation failed", {
                evaluationId: req.params.id,
                error: error
            });
            response.failure(res, error);
        });
});

module.exports = router;
