const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { CONTAINER_DEPLOY_DIR, HOST_BASE_DIR } = require('../config');
const docker = require('../services/docker');
const nginx = require('../services/nginx');
const files = require('../services/files');

const upload = multer({ dest: 'uploads/' });

function parseStripPrefix(value) {
    return value === '1' || value === true || value === 'true';
}

function configChanged(oldMeta, newMeta) {
    return String(oldMeta.port) !== String(newMeta.port)
        || (oldMeta.backend || '') !== (newMeta.backend || '')
        || (oldMeta.apiPrefix || '/api') !== (newMeta.apiPrefix || '/api')
        || !!oldMeta.stripPrefix !== !!newMeta.stripPrefix;
}

function rebuildContainer(name, meta, targetDir, hostPath) {
    let nginxConfHostDir = null;
    const nginxDir = path.join(targetDir, 'nginx');

    if (meta.backend && meta.backend.trim()) {
        const config = nginx.generateNginxConfig({
            prefix: meta.apiPrefix || '/api',
            backend: meta.backend,
            stripPrefix: meta.stripPrefix,
        });
        const result = files.writeNginxConfig(targetDir, hostPath, config);
        nginxConfHostDir = result.hostDir;
    } else if (fs.existsSync(nginxDir)) {
        fs.rmSync(nginxDir, { recursive: true });
    }

    try { docker.removeContainer(name); } catch (_e) { /* 不存在就跳过 */ }
    docker.runNginxContainer({ name, port: meta.port, hostPath, nginxConfHostDir });
    docker.checkContainerRunning(name);
}

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

        if (!req.file) {
            return res.status(400).json({ error: '请上传 zip 文件' });
        }

        try {
            files.extractZip(req.file.path, targetDir);
            fs.unlinkSync(req.file.path);

            const meta = {
                name,
                port,
                backend: backend || '',
                apiPrefix: prefix,
                stripPrefix: parseStripPrefix(stripPrefix),
            };

            rebuildContainer(name, meta, targetDir, hostPath);
            files.saveMeta(targetDir, meta);

            const proxyNote = meta.backend.trim()
                ? `，${prefix} 转发至 ${meta.backend}${meta.stripPrefix ? '（已去除前缀）' : ''}`
                : '';

            res.json({
                success: true,
                message: `项目 ${name} 已在端口 ${port} 上线${proxyNote}`,
                name,
                port,
                proxy: meta.backend.trim()
                    ? { prefix, backend: meta.backend, stripPrefix: meta.stripPrefix }
                    : null,
            });
        } catch (err) {
            console.error('[deploy]', err);
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            res.status(500).json({ error: err.message });
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

    // 更新项目：修改配置 / 上传 dist.zip 更新静态资源
    app.put('/api/project/:name', upload.single('file'), (req, res) => {
        const { name } = req.params;
        const { port, backend, apiPrefix, stripPrefix } = req.body;
        const prefix = apiPrefix || '/api';
        const targetDir = path.join(CONTAINER_DEPLOY_DIR, name);
        const hostPath = `${HOST_BASE_DIR}/${name}`;

        try {
            if (!fs.existsSync(targetDir)) {
                return res.status(404).json({ error: '项目不存在' });
            }

            let oldMeta = files.readMeta(name);
            if (!oldMeta) {
                oldMeta = {
                    name,
                    port: port || '',
                    backend: '',
                    apiPrefix: '/api',
                    stripPrefix: false,
                };
            }

            if (req.file) {
                files.updateProjectZip(req.file.path, name);
                fs.unlinkSync(req.file.path);
            }

            const newMeta = {
                name,
                port: port || oldMeta.port,
                backend: backend !== undefined ? (backend || '') : (oldMeta.backend || ''),
                apiPrefix: prefix,
                stripPrefix: stripPrefix !== undefined
                    ? parseStripPrefix(stripPrefix)
                    : !!oldMeta.stripPrefix,
            };

            if (!newMeta.port) {
                return res.status(400).json({ error: '请填写端口号' });
            }

            const configUpdated = configChanged(oldMeta, newMeta);
            files.saveMeta(targetDir, newMeta);

            if (configUpdated) {
                rebuildContainer(name, newMeta, targetDir, hostPath);
            }

            const parts = [];
            if (req.file) parts.push('静态资源已更新');
            if (configUpdated) parts.push('配置已保存');
            const message = parts.length
                ? `${name}：${parts.join('，')}`
                : `${name} 无变更`;

            res.json({ success: true, message, updated: { files: !!req.file, config: configUpdated } });
        } catch (err) {
            console.error('[update]', err);
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            res.status(500).json({ error: err.message });
        }
    });

    // 删除项目
    app.delete('/api/project/:name', (req, res) => {
        const { name } = req.params;
        try {
            docker.removeContainer(name);
            files.removeProjectDir(name);
            res.json({ success: true, message: `已删除 ${name}` });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 兼容旧删除路径
    app.delete('/delete/:name', (req, res) => {
        const { name } = req.params;
        try {
            docker.removeContainer(name);
            files.removeProjectDir(name);
            res.json({ success: true, message: `已删除 ${name}` });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
};
