const crypto = require("crypto");
const path = require("path");
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

module.exports = {
    store: store
};
