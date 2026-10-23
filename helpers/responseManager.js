function send(res, status, body)
{
    return res.status(status).json(body);
}

function success(res, message)
{
    return send(res, 200, {
        success: true,
        message: message || "Success"
    });
}

function successWithData(res, data, message)
{
    return send(res, 200, {
        success: true,
        message: message || "Success",
        data: data
    });
}

function created(res, data, message)
{
    return send(res, 201, {
        success: true,
        message: message || "Created",
        data: data
    });
}

function failure(res, error)
{
    const clientError = Boolean(error && error.isClientError);
    const status = clientError ? 400 : 500;
    const message = clientError ? error.message : "Unexpected server error.";

    return send(res, status, {
        success: false,
        message: message
    });
}

function notFound(res, message)
{
    return send(res, 404, {
        success: false,
        message: message || "Not found."
    });
}

module.exports = {
    send: send,
    success: success,
    successWithData: successWithData,
    created: created,
    failure: failure,
    notFound: notFound
};
