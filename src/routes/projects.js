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

            // E. 保存部署元数据（供后续编辑使用）
            files.saveMeta(targetDir, { name, port, backend: backend || '', apiPrefix: prefix, stripPrefix: !!stripPrefix });

            const proxyNote = (backend && backend.trim())
                ? `<br>🔀 ${prefix} 请求转发到 ${backend}${stripPrefix ? '（已去除前缀）' : ''}`
                : '';
            res.send(`<h2>✅ 部署成功！</h2><p>项目 ${name} 已在端口 ${port} 上线。${proxyNote}</p><a href="/">返回首页</a>`);
        } catch (err) {
            console.error('[deploy]', err);
            res.status(500).send(`部署失败: ${err.message}`);
        }
    });

    // 获取项目配置
    app.get('/api/project/:name', (req, res) => {
        try {
            const meta = files.readMeta(req.params.name);
            if (!meta) return res.status(404).json({ error: '项目不存在' });
            res.json(meta);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 更新项目配置（不重新解压，只更新 nginx 配置并重建容器）
    app.put('/api/project/:name', (req, res) => {
        const { name } = req.params;
        const { port, backend, apiPrefix, stripPrefix } = req.body;
        const prefix = apiPrefix || '/api';
        const targetDir = path.join(CONTAINER_DEPLOY_DIR, name);
        const hostPath = `${HOST_BASE_DIR}/${name}`;

        try {
            // A. 重新生成 nginx 配置
            let nginxConfHostDir = null;
            if (backend && backend.trim()) {
                const config = nginx.generateNginxConfig({ prefix, backend, stripPrefix });
                const result = files.writeNginxConfig(targetDir, hostPath, config);
                nginxConfHostDir = result.hostDir;
            }

            // B. 重建容器
            try { docker.removeContainer(name); } catch (_e) {}
            docker.runNginxContainer({ name, port, hostPath, nginxConfHostDir });
            docker.checkContainerRunning(name);

            // C. 更新元数据
            files.saveMeta(targetDir, { name, port, backend: backend || '', apiPrefix: prefix, stripPrefix: !!stripPrefix });

            res.json({ success: true, message: `${name} 已更新` });
        } catch (err) {
            console.error('[update]', err);
            res.status(500).json({ error: err.message });
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
