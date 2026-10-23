const crypto = require("crypto");
const path = require("path");
const config = require("../config/appConfig");
const r2Storage = require("./r2Storage");

function store(file)
{
    return new Promise(function (resolve, reject)
    {
        const date = new Date().toISOString().slice(0, 10);
        const extension = path.extname(file.originalname).toLowerCase();
        const objectKey = "recordings/" + date + "/" + crypto.randomUUID() + extension;

        r2Storage.putObject(objectKey, file.buffer, file.size, file.mimetype)
            .then(function ()
            {
                r2Storage.getObjectMetadata(objectKey)
                    .then(function (metadata)
                    {
                        if (metadata.size === file.size)
                        {
                            resolve(objectKey);
                        }
                        else
                        {
                            r2Storage.deleteObject(objectKey)
                                .then(function ()
                                {
                                    reject({
                                        message: "Uploaded R2 object size did not match the received file.",
                                        isClientError: false
                                    });
                                })
                                .catch(function (error)
                                {
                                    console.error("[uploadManager.store] remove invalid R2 upload failed", {
                                        objectKey: objectKey,
                                        error: error
                                    });
                                    reject(error);
                                });
                        }
                    })
                    .catch(function (error)
                    {
                        console.error("[uploadManager.store] read uploaded R2 metadata failed", {
                            objectKey: objectKey,
                            error: error
                        });
                        reject(error);
                    });
            })
            .catch(function (error)
            {
                console.error("[uploadManager.store] store recording in R2 failed", {
                    objectKey: objectKey,
                    error: error
                });
                reject(error);
            });
    });
}

function createUpload(fileName, mimeType, fileSize)
{
    return new Promise(function (resolve, reject)
    {
        const size = Number(fileSize);

        if (typeof fileName !== "string" || !fileName.trim())
        {
            reject({ message: "file_name is required.", isClientError: true });
        }
        else if (typeof mimeType !== "string" || !/^(video|audio)\//.test(mimeType))
        {
            reject({ message: "Only audio or video recordings are accepted.", isClientError: true });
        }
        else if (!Number.isFinite(size) || size <= 0 || size > config.maxUploadMb * 1024 * 1024)
        {
            reject({
                message: "File size must be between 1 byte and " + config.maxUploadMb + " MB.",
                isClientError: true
            });
        }
        else
        {
            const date = new Date().toISOString().slice(0, 10);
            const extension = path.extname(fileName).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10);
            const objectKey = "recordings/" + date + "/" + crypto.randomUUID() + extension;

            r2Storage.presignedPutUrl(objectKey, config.uploadUrlExpirySeconds)
                .then(function (uploadUrl)
                {
                    resolve({
                        object_key: objectKey,
                        upload_url: uploadUrl,
                        expires_in: config.uploadUrlExpirySeconds
                    });
                })
                .catch(function (error)
                {
                    console.error("[uploadManager.createUpload] create upload URL failed", {
                        objectKey: objectKey,
                        error: error
                    });
                    reject(error);
                });
        }
    });
}

function verifyUpload(objectKey, expectedSize)
{
    return new Promise(function (resolve, reject)
    {
        r2Storage.getObjectMetadata(objectKey)
            .then(function (metadata)
            {
                if (metadata.size > 0 && metadata.size <= config.maxUploadMb * 1024 * 1024 &&
                    (!expectedSize || metadata.size === Number(expectedSize)))
                {
                    resolve(metadata.size);
                }
                else
                {
                    r2Storage.deleteObject(objectKey)
                        .then(function ()
                        {
                            reject({
                                message: "Uploaded file size did not match. Please upload again.",
                                isClientError: true
                            });
                        })
                        .catch(function (error)
                        {
                            console.error("[uploadManager.verifyUpload] remove invalid R2 upload failed", {
                                objectKey: objectKey,
                                error: error
                            });
                            reject(error);
                        });
                }
            })
            .catch(function (error)
            {
                console.error("[uploadManager.verifyUpload] read uploaded R2 metadata failed", {
                    objectKey: objectKey,
                    error: error
                });
                reject({
                    message: "The uploaded file was not found in storage. Please upload again.",
                    isClientError: true
                });
            });
    });
}

module.exports = {
    store: store,
    createUpload: createUpload,
    verifyUpload: verifyUpload
};
