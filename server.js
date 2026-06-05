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
// HOST_BASE_DIR: 宿主机存放项目的真实绝对路径 (必须与宿主机一致)
// 建议路径: /opt/frontend-deployer/deployed_projects 或 /root/frontend-deployer/deployed_projects
const HOST_BASE_DIR = "/opt/frontend-deployer/deployed_projects"; 
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
        if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true });
        const zip = new admZip(req.file.path);
        zip.extractAllTo(targetDir, true);
        fs.unlinkSync(req.file.path);

        // B. 自动纠正 dist 嵌套：如果根目录没 index.html 且只有一个子目录，则提取内容
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
        // 写入用容器内路径，docker -v 挂载用宿主机路径
        const nginxConfContainerPath = path.join(targetDir, 'nginx.conf');
        const nginxConfHostPath = path.join(hostPath, 'nginx.conf');
        if (backend && backend.trim()) {
            const nginxConf = `server {
    listen       80;
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
            fs.writeFileSync(nginxConfContainerPath, nginxConf);
        }

        // D. 启动容器（带 Label 标记）
        try { execSync(`${DOCKER_API} docker rm -f ${name}`, { stdio: 'ignore' }); } catch (e) {}

        let dockerCmd = `${DOCKER_API} docker run -d \
            --name ${name} \
            --label ${APP_LABEL} \
            -p ${port}:80 \
            -v ${hostPath}:/usr/share/nginx/html:ro \
            --restart always`;

        // 如果有 nginx 配置，挂载覆盖默认配置
        if (backend && backend.trim()) {
            dockerCmd += ` \\\n            -v ${nginxConfHostPath}:/etc/nginx/conf.d/default.conf:ro`;
        }

        dockerCmd += ` \\\n            nginx:alpine`;
        
        execSync(dockerCmd);

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