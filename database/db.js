const { Pool } = require("pg");

const pool = new Pool(require("../config/dbConfig"));

pool.on("error", function (error)
{
    console.error("[database.db] idle client failed", error);
});

function get()
{
    return pool;
}

function connect()
{
    return new Promise(function (resolve, reject)
    {
        pool.query("SELECT 1")
            .then(function ()
            {
                resolve(true);
            })
            .catch(function (error)
            {
                console.error("[database.connect] database connection check failed", error);
                reject(error);
            });
    });
}

function query(sql, values)
{
    return new Promise(function (resolve, reject)
    {
        pool.query(sql, values || [])
            .then(function (result)
            {
                resolve(result);
            })
            .catch(function (error)
            {
                console.error("[database.query] PostgreSQL query failed", error);
                reject(error);
            });
    });
}

function close()
{
    return new Promise(function (resolve, reject)
    {
        pool.end()
            .then(function ()
            {
                resolve(true);
            })
            .catch(function (error)
            {
                console.error("[database.close] PostgreSQL pool close failed", error);
                reject(error);
            });
    });
}

module.exports = {
    get: get,
    connect: connect,
    query: query,
    close: close
};
