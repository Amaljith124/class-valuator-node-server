function logHandler(req, res, next)
{
    const startedAt = Date.now();

    res.on("finish", function ()
    {
        console.log(JSON.stringify({
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            durationMs: Date.now() - startedAt
        }));
    });

    next();
}

module.exports = logHandler;
