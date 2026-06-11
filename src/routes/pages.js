const path = require('path');
const express = require('express');

module.exports = function pagesRoute(app) {
    const publicDir = path.join(__dirname, '..', 'public');

    app.use(express.static(publicDir));

    app.get('/', (_req, res) => {
        res.sendFile(path.join(publicDir, 'index.html'));
    });
};
