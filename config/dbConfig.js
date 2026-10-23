require("dotenv").config();

if (process.env.DATABASE_URL)
{
    module.exports = {
        connectionString: process.env.DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
    };
}
else
{
    throw new Error("DATABASE_URL is required");
}
