require("dotenv").config();

module.exports = {
    appName: process.env.APP_NAME,
    nodeEnv: process.env.NODE_ENV,
    port: Number(process.env.PORT),
    fastApiBaseUrl: process.env.FASTAPI_BASE_URL,
    fastApiInternalToken: process.env.FASTAPI_INTERNAL_TOKEN,
    apiAccessToken: process.env.API_ACCESS_TOKEN,
    corsOrigin: process.env.CORS_ORIGIN,
    queueName: process.env.PG_BOSS_QUEUE,
    pgBossBatchSize: Number(process.env.PG_BOSS_BATCH_SIZE || 1),
    pgBossPollSeconds: Number(process.env.PG_BOSS_POLL_SECONDS || 2),
    pgBossRetryLimit: Number(process.env.PG_BOSS_RETRY_LIMIT || 1),
    pgBossRetryDelaySeconds: Number(process.env.PG_BOSS_RETRY_DELAY_SECONDS || 60),
    pgBossExpireSeconds: Number(process.env.PG_BOSS_EXPIRE_SECONDS || 3600),
    fastApiTimeoutMs: Number(process.env.FASTAPI_TIMEOUT_MS),
    r2AccountId: process.env.R2_ACCOUNT_ID,
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    r2BucketName: process.env.R2_BUCKET_NAME,
    r2Endpoint: process.env.R2_ENDPOINT,
    r2Region: process.env.R2_REGION,
    maxUploadMb: Number(process.env.MAX_UPLOAD_MB),
    uploadUrlExpirySeconds: Number(process.env.UPLOAD_URL_EXPIRY_SECONDS || 3600),
    uploadDir: process.env.UPLOAD_DIR
};
