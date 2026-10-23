function toCamelCase(row)
{
    if (!row)
    {
        return null;
    }

    return Object.keys(row).reduce(function (model, key)
    {
        const camelKey = key.replace(/_([a-z])/g, function (match, letter)
        {
            return letter.toUpperCase();
        });

        model[camelKey] = row[key];
        return model;
    }, {});
}

function toCamelCaseList(rows)
{
    return rows.map(toCamelCase);
}

module.exports = {
    toCamelCase: toCamelCase,
    toCamelCaseList: toCamelCaseList
};
