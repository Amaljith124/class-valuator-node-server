const Minio = require("minio");
const config = require("../config/appConfig");

let client = null;

function getClient()
{
    return new Promise(function (resolve, reject)
    {
        if (client)
        {
            resolve(client);
        }
        else if (!config.r2AccountId || !config.r2Endpoint || !config.r2AccessKeyId ||
            !config.r2SecretAccessKey || !config.r2BucketName)
        {
            reject({
                message: "R2_ACCOUNT_ID, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME must be configured.",
                isClientError: false
            });
        }
        else
        {
            const endpoint = new URL(config.r2Endpoint);

            if (endpoint.protocol !== "https:" || endpoint.hostname !== config.r2AccountId + ".r2.cloudflarestorage.com")
            {
                reject({
                    message: "R2_ENDPOINT must be the HTTPS endpoint for R2_ACCOUNT_ID.",
                    isClientError: false
                });
            }
            else
            {
                client = new Minio.Client({
                    endPoint: endpoint.hostname,
                    port: Number(endpoint.port || 443),
                    useSSL: true,
                    accessKey: config.r2AccessKeyId,
                    secretKey: config.r2SecretAccessKey,
                    region: config.r2Region
                });
                resolve(client);
            }
        }
    });
}

function validateObjectKey(objectKey)
{
    return new Promise(function (resolve, reject)
    {
        if (typeof objectKey !== "string" || !objectKey.startsWith("recordings/") || objectKey.startsWith("/") ||
            objectKey.split("/").some(function (part) { return !part || part === "." || part === ".."; }) || objectKey.includes("://"))
        {
            reject({ message: "Invalid R2 object key.", isClientError: true });
        }
        else
        {
            resolve(objectKey);
        }
    });
}

function putObject(objectKey, body, size, contentType)
{
    return new Promise(function (resolve, reject)
    {
        validateObjectKey(objectKey)
            .then(function (validatedKey)
            {
                getClient()
                    .then(function (storageClient)
                    {
                        storageClient.putObject(config.r2BucketName, validatedKey, body, size, {
                            "Content-Type": contentType
                        })
                            .then(function (result)
                            {
                                resolve(result);
                            })
                            .catch(function (error)
                            {
                                console.error("[r2Storage.putObject] upload R2 object failed", {
                                    objectKey: validatedKey,
                                    error: error
                                });
                                reject(error);
                            });
                    })
                    .catch(function (error)
                    {
                        console.error("[r2Storage.putObject] initialize R2 client failed", error);
                        reject(error);
                    });
            })
            .catch(function (error)
            {
                console.error("[r2Storage.putObject] validate R2 object key failed", { objectKey: objectKey, error: error });
                reject(error);
            });
    });
}

function objectExists(objectKey)
{
    return new Promise(function (resolve, reject)
    {
        validateObjectKey(objectKey)
            .then(function (validatedKey)
            {
                getClient()
                    .then(function (storageClient)
                    {
                        storageClient.statObject(config.r2BucketName, validatedKey)
                            .then(function ()
                            {
                                resolve(true);
                            })
                            .catch(function (error)
                            {
                                console.error("[r2Storage.objectExists] inspect R2 object failed", {
                                    objectKey: validatedKey,
                                    error: error
                                });
                                reject(error);
                            });
                    })
                    .catch(function (error)
                    {
                        console.error("[r2Storage.objectExists] initialize R2 client failed", error);
                        reject(error);
                    });
            })
            .catch(function (error)
            {
                console.error("[r2Storage.objectExists] validate R2 object key failed", { objectKey: objectKey, error: error });
                reject(error);
            });
    });
}

function getObjectMetadata(objectKey)
{
    return new Promise(function (resolve, reject)
    {
        validateObjectKey(objectKey)
            .then(function (validatedKey)
            {
                getClient()
                    .then(function (storageClient)
                    {
                        storageClient.statObject(config.r2BucketName, validatedKey)
                            .then(function (metadata)
                            {
                                resolve(metadata);
                            })
                            .catch(function (error)
                            {
                                console.error("[r2Storage.getObjectMetadata] read R2 object metadata failed", {
                                    objectKey: validatedKey,
                                    error: error
                                });
                                reject(error);
                            });
                    })
                    .catch(function (error)
                    {
                        console.error("[r2Storage.getObjectMetadata] initialize R2 client failed", error);
                        reject(error);
                    });
            })
            .catch(function (error)
            {
                console.error("[r2Storage.getObjectMetadata] validate R2 object key failed", {
                    objectKey: objectKey,
                    error: error
                });
                reject(error);
            });
    });
}

function deleteObject(objectKey)
{
    return new Promise(function (resolve, reject)
    {
        validateObjectKey(objectKey)
            .then(function (validatedKey)
            {
                getClient()
                    .then(function (storageClient)
                    {
                        storageClient.removeObject(config.r2BucketName, validatedKey)
                            .then(function ()
                            {
                                resolve(true);
                            })
                            .catch(function (error)
                            {
                                console.error("[r2Storage.deleteObject] delete R2 object failed", {
                                    objectKey: validatedKey,
                                    error: error
                                });
                                reject(error);
                            });
                    })
                    .catch(function (error)
                    {
                        console.error("[r2Storage.deleteObject] initialize R2 client failed", error);
                        reject(error);
                    });
            })
            .catch(function (error)
            {
                console.error("[r2Storage.deleteObject] validate R2 object key failed", {
                    objectKey: objectKey,
                    error: error
                });
                reject(error);
            });
    });
}

module.exports = {
    putObject: putObject,
    objectExists: objectExists,
    getObjectMetadata: getObjectMetadata,
    deleteObject: deleteObject
};
