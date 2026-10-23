const http = require("http");
const express = require("express");
const cors = require("cors");
const PgBoss = require("pg-boss");
const { Server } = require("socket.io");
const config = require("./config/appConfig");
const database = require("./database/db");
const tokenHandler = require("./middlewares/tokenHandler");
const logHandler = require("./middlewares/logHandler");
const videoAnalysisManager = require("./helpers/videoAnalysisManager");
const socketManager = require("./helpers/socketManager");

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: { origin: config.corsOrigin }
});
socketManager.initialize(io);
const boss = new PgBoss({
    connectionString: require("./config/dbConfig").connectionString
});

boss.on("error", function (error)
{
    console.error("[server.pgBoss] background queue error", error);
});

app.locals.boss = boss;
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "2mb" }));
app.use(logHandler);

app.use("/", require("./routes/general/indexRouter"));
app.use("/api/v1/agent", tokenHandler, require("./routes/agent/indexRouter")(boss));
app.use("/api/v1/user", tokenHandler, require("./routes/user/indexRouter")(boss));

function startHttpServer()
{
    return new Promise(function (resolve, reject)
    {
        const server = httpServer.listen(config.port, function ()
        {
            console.log(config.appName + " listening on " + config.port);
            resolve(server);
        });

        server.on("error", function (error)
        {
            console.error("[server.startHttpServer] start HTTP listener failed", error);
            reject(error);
        });
    });
}

function closeResources(signal, server)
{
    console.log("[server.closeResources] shutting down after " + signal);

    server.close(function (httpError)
    {
        if (httpError)
        {
            console.error("[server.closeResources] close HTTP listener failed", httpError);
        }
        else
        {
            // The HTTP listener closed cleanly.
        }

        boss.stop()
            .then(function ()
            {
                database.close()
                    .then(function ()
                    {
                        process.exit(0);
                    })
                    .catch(function (error)
                    {
                        console.error("[server.closeResources] close database pool failed", error);
                        process.exit(1);
                    });
            })
            .catch(function (error)
            {
                console.error("[server.closeResources] stop pg-boss failed", error);

                database.close()
                    .then(function ()
                    {
                        process.exit(1);
                    })
                    .catch(function (closeError)
                    {
                        console.error("[server.closeResources] close database after pg-boss failure failed", closeError);
                        process.exit(1);
                    });
            });
    });
}

function closeAfterStartupFailure(originalError)
{
    boss.stop()
        .then(function ()
        {
            database.close()
                .then(function ()
                {
                    process.exitCode = 1;
                })
                .catch(function (error)
                {
                    console.error("[server.closeAfterStartupFailure] close database pool failed", error);
                    process.exitCode = 1;
                });
        })
        .catch(function (error)
        {
            console.error("[server.closeAfterStartupFailure] stop pg-boss failed", error);

            database.close()
                .then(function ()
                {
                    process.exitCode = 1;
                })
                .catch(function (closeError)
                {
                    console.error("[server.closeAfterStartupFailure] close database after pg-boss failure failed", closeError);
                    process.exitCode = 1;
                });
        });

    console.error("[server.start] startup failed", originalError);
}

function start()
{
    return new Promise(function (resolve, reject)
    {
        database.connect()
            .then(function ()
            {
                boss.start()
                    .then(function ()
                    {
                        boss.createQueue(config.queueName)
                            .then(function ()
                            {
                                videoAnalysisManager.recoverQueuedJobs(boss)
                                    .then(function ()
                                    {
                                        videoAnalysisManager.register(boss)
                                            .then(function ()
                                            {
                                                startHttpServer()
                                                    .then(function (server)
                                                    {
                                                        process.on("SIGINT", function ()
                                                        {
                                                            closeResources("SIGINT", server);
                                                        });

                                                        process.on("SIGTERM", function ()
                                                        {
                                                            closeResources("SIGTERM", server);
                                                        });

                                                        resolve(server);
                                                    })
                                                    .catch(function (error)
                                                    {
                                                        console.error("[server.start] listen after worker registration failed", error);
                                                        closeAfterStartupFailure(error);
                                                        reject(error);
                                                    });
                                            })
                                            .catch(function (error)
                                            {
                                                console.error("[server.start] register worker failed", error);
                                                closeAfterStartupFailure(error);
                                                reject(error);
                                            });
                                    })
                                    .catch(function (error)
                                    {
                                        console.error("[server.start] recover failed queued jobs failed", error);
                                        closeAfterStartupFailure(error);
                                        reject(error);
                                    });
                            })
                            .catch(function (error)
                            {
                                console.error("[server.start] create pg-boss queue failed", {
                                    queueName: config.queueName,
                                    error: error
                                });
                                closeAfterStartupFailure(error);
                                reject(error);
                            });
                    })
                    .catch(function (error)
                    {
                        console.error("[server.start] start pg-boss failed", error);
                        closeAfterStartupFailure(error);
                        reject(error);
                    });
            })
            .catch(function (error)
            {
                console.error("[server.start] connect database failed", error);
                closeAfterStartupFailure(error);
                reject(error);
            });
    });
}

start().catch(function (error)
{
    console.error("[server.main] Node server did not start", error);
    process.exitCode = 1;
});

module.exports = app;
