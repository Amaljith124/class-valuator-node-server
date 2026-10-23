let io = null;

function initialize(socketServer)
{
    io = socketServer;
}

function emitProcessUpdate(process)
{
    if (io)
    {
        const update = {
            process_id: process.processId,
            evaluation_id: process.evaluationId,
            status: process.status,
            updated_at: process.updatedDate,
            refresh: true
        };

        io.emit("process:update", update);
    }
    else
    {
        // Socket server is not initialized in this process.
    }
}

module.exports = {
    initialize: initialize,
    emitProcessUpdate: emitProcessUpdate
};
