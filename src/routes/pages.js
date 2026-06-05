const path = require('path');

module.exports = function pagesRoute(app) {
    app.get('/', (_req, res) => {
        res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    });
};
