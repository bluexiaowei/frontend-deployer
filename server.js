const express = require('express');
const multer = require('multer');
const admZip = require('adm-zip');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' });

// --- 核心配置区 ---
// DOCKER_API: 兼容 CentOS 7 的旧版 Docker API
const DOCKER_API = "DOCKER_API_VERSION=1.43"; 
// HOST_BASE_DIR: 自动检测宿主机上 deployed_projects 的真实路径
// 通过 docker inspect 自身容器获取 bind mount 的 Source，无需手动配置
let HOST_BASE_DIR = process.env.HOST_BASE_DIR; // 仍支持手动覆盖
if (!HOST_BASE_DIR) {
    try {
        const selfId = process.env.HOSTNAME;
        HOST_BASE_DIR = execSync(
            `${DOCKER_API} docker inspect ${selfId} --format "{{range .Mounts}}{{if eq .Destination \\"/app/deployed_projects\\"}}{{.Source}}{{end}}{{end}}"`
        ).toString().trim();
    } catch (_) {
        HOST_BASE_DIR = "/opt/frontend-deployer/deployed_projects";
    }
}
console.log(`HOST_BASE_DIR = ${HOST_BASE_DIR}`); 
// CONTAINER_DEPLOY_DIR: 容器内挂载的路径
const CONTAINER_DEPLOY_DIR = "/app/deployed_projects"; 
// TAG: 用于识别由本系统创建的容器
const APP_LABEL = "managed-by=frontend-deployer";
// ----------------

// 1. 静态界面
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. 获取列表（仅显示本系统部署的项目）
app.get('/api/list', (req, res) => {
    try {
        const filter = `--filter "label=${APP_LABEL}"`;
        const result = execSync(`${DOCKER_API} docker ps ${filter} --format "{{.Names}}|{{.Ports}}"`).toString();
        
        const list = result.trim().split('\n').filter(l => l).map(line => {
            const [name, portInfo] = line.split('|');
            const portMatch = portInfo.match(/:(\d+)->/);
            return { 
                name: name, 
                port: portMatch ? portMatch[1] : 'unknown' 
            };
        });
        res.json(list);
    } catch (e) {
        res.json([]);
    }
});

// 3. 部署逻辑（包含嵌套目录自动识别）
app.post('/deploy', upload.single('file'), (req, res) => {
    const { name, port, backend, apiPrefix } = req.body;
    const prefix = apiPrefix || '/api';
    const targetDir = path.join(CONTAINER_DEPLOY_DIR, name);
    const hostPath = `${HOST_BASE_DIR}/${name}`;

    try {
        // A. 解压并清理
        try {
            fs.rmSync(targetDir, { recursive: true, force: true });
        } catch (_) {
            // fs.rmSync 删不掉的（如 Docker 残留）用 rm -rf 兜底，前提是路径安全
            if (targetDir.startsWith(CONTAINER_DEPLOY_DIR + '/') && targetDir.length > CONTAINER_DEPLOY_DIR.length + 1) {
                execSync(`rm -rf ${targetDir}`, { stdio: 'ignore' });
            }
        }
        const zip = new admZip(req.file.path);
        zip.extractAllTo(targetDir, true);
        fs.unlinkSync(req.file.path);

        // B. 自动纠正 dist 嵌套：如果根目录没 index.html 且只有一个子目录，则提取内容
        console.log(`[解压完成] ${targetDir}:`, fs.readdirSync(targetDir));
        let items = fs.readdirSync(targetDir).filter(item => !item.startsWith('.'));
        if (!items.includes('index.html') && items.length === 1) {
            const subDir = path.join(targetDir, items[0]);
            if (fs.lstatSync(subDir).isDirectory()) {
                console.log(`检测到嵌套目录 ${items[0]}，正在平铺文件...`);
                fs.readdirSync(subDir).forEach(file => {
                    fs.renameSync(path.join(subDir, file), path.join(targetDir, file));
                });
                fs.rmdirSync(subDir);
            }
        }

        // C. 生成 nginx 配置（如果配置了后端转发）
        // 写入 targetDir/nginx/default.conf，挂载整个 nginx/ 目录避免单文件挂载的坑
        const nginxConfDir = path.join(targetDir, 'nginx');
        const nginxConfHostDir = path.join(hostPath, 'nginx');
        if (backend && backend.trim()) {
            fs.mkdirSync(nginxConfDir, { recursive: true });
            const nginxConf = `server {
    listen       80;
    listen  [::]:80;
    server_name  localhost;

    # 静态文件根目录
    root   /usr/share/nginx/html;
    index  index.html index.htm;

    # API 转发到后端
    location ${prefix} {
        proxy_pass ${backend};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 如果后端也需要前缀，保留原始路径；如果不需要，去掉前缀用下面这行:
        # rewrite ^${prefix}/(.*) /$1 break;
    }

    # 其余请求走静态文件
    location / {
        try_files $uri $uri/ /index.html;
    }
}
`;
            fs.writeFileSync(path.join(nginxConfDir, 'default.conf'), nginxConf);
        }

        // D. 启动容器（带 Label 标记）
        try { execSync(`${DOCKER_API} docker rm -f ${name}`, { stdio: 'ignore' }); } catch (e) {}

        let dockerCmd = `${DOCKER_API} docker run -d \
            --name ${name} \
            --label ${APP_LABEL} \
            -p ${port}:80 \
            -v ${hostPath}:/usr/share/nginx/html:ro \
            --restart always`;

        // 挂载 nginx 配置目录（目录挂载，避免单文件挂载的 docker bug）
        if (backend && backend.trim()) {
            dockerCmd += ` \\\n            -v ${nginxConfHostDir}:/etc/nginx/conf.d:ro`;
        }

        dockerCmd += ` \\\n            nginx:alpine`;
        
        execSync(dockerCmd);

        // E. 部署后健康检查：确认容器正常运行
        try {
            const status = execSync(
                `${DOCKER_API} docker inspect --format "{{.State.Status}}" ${name}`
            ).toString().trim();
            if (status !== 'running') {
                const logs = execSync(`${DOCKER_API} docker logs --tail 20 ${name} 2>&1`).toString();
                throw new Error(`容器状态: ${status}\nnginx 日志:\n${logs}`);
            }
        } catch (e) {
            if (e.message.includes('容器状态')) throw e;
        }

        const proxyNote = (backend && backend.trim())
            ? `<br>🔀 ${prefix} 请求转发到 ${backend}`
            : '';
        res.send(`<h2>✅ 部署成功！</h2><p>项目 ${name} 已在端口 ${port} 上线。${proxyNote}</p><a href="/">返回首页</a>`);
    } catch (err) {
        console.error(err);
        res.status(500).send(`部署失败: ${err.message}`);
    }
});

// 4. 删除逻辑
app.delete('/delete/:name', (req, res) => {
    const name = req.params.name;
    try {
        execSync(`${DOCKER_API} docker rm -f ${name}`);
        const dir = path.join(CONTAINER_DEPLOY_DIR, name);
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
        res.sendStatus(200);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

app.listen(4000, () => console.log('Frontend Deployer is running on port 4000'));