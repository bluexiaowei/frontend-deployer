const pagesRoute = require('./pages');
const projectsRoute = require('./projects');

module.exports = function registerRoutes(app) {
    pagesRoute(app);
    projectsRoute(app);
};
