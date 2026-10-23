const crypto = require("crypto");
const config = require("../config/appConfig");

function tokenHandler(req, res, next)
{
    const expected = config.apiAccessToken;
    const authorization = req.headers.authorization || "";
    const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

    if (!expected && config.nodeEnv === "development")
    {
        next();
    }
    else if (!expected)
    {
        res.status(503).json({
            success: false,
            message: "API token is not configured."
        });
    }
    else
    {
        const expectedBuffer = Buffer.from(expected);
        const suppliedBuffer = Buffer.from(supplied);

        if (expectedBuffer.length === suppliedBuffer.length && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer))
        {
            next();
        }
        else
        {
            res.status(401).json({
                success: false,
                message: "Unauthorised."
            });
        }
    }
}

module.exports = tokenHandler;
