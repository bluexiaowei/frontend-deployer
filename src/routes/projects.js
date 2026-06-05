const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { CONTAINER_DEPLOY_DIR, HOST_BASE_DIR } = require('../config');
const docker = require('../services/docker');
const nginx = require('../services/nginx');
const files = require('../services/files');

const upload = multer({ dest: 'uploads/' });

module.exports = function projectsRoute(app) {
    // 获取已部署项目列表
    app.get('/api/list', (_req, res) => {
        try {
            res.json(docker.listContainers());
        } catch (_e) {
            res.json([]);
        }
    });

    // 部署项目
    app.post('/deploy', upload.single('file'), (req, res) => {
        const { name, port, backend, apiPrefix, stripPrefix } = req.body;
        const prefix = apiPrefix || '/api';
        const targetDir = path.join(CONTAINER_DEPLOY_DIR, name);
        const hostPath = `${HOST_BASE_DIR}/${name}`;

        try {
            // A. 解压并清理
            files.extractZip(req.file.path, targetDir);
            fs.unlinkSync(req.file.path);

            // B. 生成 nginx 配置（如果配置了后端转发）
            let nginxConfHostDir = null;
            if (backend && backend.trim()) {
                const config = nginx.generateNginxConfig({ prefix, backend, stripPrefix });
                const result = files.writeNginxConfig(targetDir, hostPath, config);
                nginxConfHostDir = result.hostDir;
            }

            // C. 移除旧容器并启动新容器
            try { docker.removeContainer(name); } catch (_e) { /* 不存在就跳过 */ }
            docker.runNginxContainer({ name, port, hostPath, nginxConfHostDir });

            // D. 健康检查
            docker.checkContainerRunning(name);

            const proxyNote = (backend && backend.trim())
                ? `<br>🔀 ${prefix} 请求转发到 ${backend}${stripPrefix ? '（已去除前缀）' : ''}`
                : '';
            res.send(`<h2>✅ 部署成功！</h2><p>项目 ${name} 已在端口 ${port} 上线。${proxyNote}</p><a href="/">返回首页</a>`);
        } catch (err) {
            console.error('[deploy]', err);
            res.status(500).send(`部署失败: ${err.message}`);
        }
    });

    // 删除项目
    app.delete('/delete/:name', (req, res) => {
        const { name } = req.params;
        try {
            docker.removeContainer(name);
            files.removeProjectDir(name);
            res.sendStatus(200);
        } catch (e) {
            res.status(500).send(e.message);
        }
    });
};
