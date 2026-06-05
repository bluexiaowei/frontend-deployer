const express = require('express');
const registerRoutes = require('./routes');

const app = express();

// 路由
registerRoutes(app);

// 启动
const PORT = 4000;
app.listen(PORT, () => {
    console.log(`[server] Frontend Deployer listening on port ${PORT}`);
});
