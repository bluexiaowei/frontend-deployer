# 🚀 Frontend Deployer

轻量级前端部署管理工具 — 通过 Node.js 控制宿主机 Docker，实现前端 `.zip` 包自动解压、Nginx 容器化发布、API 反向代理。

---

## ✨ 核心特性

- **一键部署**：上传 ZIP、填端口、点部署，三步上线
- **智能解压**：自动识别并修复嵌套 `dist` 目录，确保 `index.html` 始终在 Nginx 根目录
- **API 反向代理**：支持将 `/api` 等前缀请求转发到后端，可去除前缀，自动处理 Origin 头
- **在线编辑**：已部署项目可在线修改端口、后端地址等参数，无需重新上传
- **精准管理**：通过 Docker Label 技术，管理界面仅显示本系统部署的项目
- **环境隔离**：管理后台运行在容器中，绕过 CentOS 7 GLIBC 版本限制
- **路径自适应**：自动检测宿主机目录，无需手动配置路径

---

## 📁 项目结构

```
src/
  config.js              # 配置 + HOST_BASE_DIR 自动检测
  server.js              # Express 入口
  routes/
    index.js             # 路由注册
    pages.js             # 静态页面
    projects.js          # 部署 / 列表 / 编辑 / 删除 API
  services/
    docker.js            # Docker 操作封装
    nginx.js             # Nginx 配置生成
    files.js             # 文件处理（解压 / 扁平化 / 清理）
  public/
    index.html           # 管理界面
docker-compose.yml       # Docker Compose 配置
Dockerfile               # 镜像构建
package.json             # 依赖配置
```

---

## 🛠️ 技术栈

- **后端**：Node.js + Express
- **前端**：原生 HTML/CSS/JS（单文件，零构建）
- **文件处理**：multer（上传）、adm-zip（解压）
- **容器化**：Docker + Docker Compose
- **Web 服务器**：Nginx Alpine
- **架构**：DooD (Docker-out-of-Docker)

---

## 🚀 快速开始

### 1. 环境要求

- Docker 20.10+
- Docker Compose 1.29+
- 任意 Linux 发行版

### 2. 部署

```bash
git clone <repo-url> && cd frontend-deployer
docker compose up -d --build
```

> **路径说明**：系统启动时自动通过 `docker inspect` 检测 `deployed_projects` 在宿主机上的真实路径，无需手动配置 `HOST_BASE_DIR`。如需覆盖，可设置环境变量 `HOST_BASE_DIR=/your/path`。

### 3. 访问

打开 `http://服务器IP:4000`

### 4. 更新

```bash
git pull
docker compose up -d --build
```

管理后台重启期间，已上线的项目容器不受影响。

---

## 📖 使用指南

### 部署新项目

1. 填写**项目名称**和**访问端口**
2. 上传标准 `.zip` 压缩包
3. （可选）展开「API 转发」配置后端代理
4. 点击「开始部署」

### API 转发

展开「API 转发」面板后：

| 参数 | 说明 | 示例 |
|---|---|---|
| 后端地址 | 后端服务完整 URL（含端口） | `http://192.168.1.100:3000` |
| 转发前缀 | 需要代理的路径前缀 | `/api`（默认） |
| 去除前缀 | `/api/users` → `/users` | 勾选即可 |

> 转发时自动将 `Host` 改为后端地址、清空 `Origin` 头，行为与 webpack `devServer.proxy` 的 `changeOrigin: true` 一致。

### 编辑已部署项目

点击项目卡片上的「编辑」，可修改：
- 访问端口
- 后端地址（留空则取消 API 转发）
- 转发前缀
- 是否去除前缀

保存后自动重建 Nginx 容器，无需重新上传文件。

### 删除项目

点击「删除」→ 确认弹窗 → 自动清理容器和文件。

---

## ⚙️ 架构说明

### DooD 模式

管理容器通过挂载 `/var/run/docker.sock` 控制宿主机 Docker，项目文件通过 bind mount 共享：

```
宿主机 deployed_projects/  ←→  管理容器 /app/deployed_projects/  (读写)
宿主机 deployed_projects/  ←→  Nginx 容器 /usr/share/nginx/html/  (只读)
```

### 部署流程

1. 接收 ZIP → 解压到 `deployed_projects/项目名/`
2. 检测嵌套目录并自动平铺
3. 如配置了后端转发 → 生成 `nginx/default.conf`
4. `docker run` 启动 Nginx 容器，挂载静态文件 + nginx 配置
5. 健康检查确认容器运行 → 保存 `deploy.json` 元数据
6. 返回成功

### API 转发配置示例

生成的 `nginx/default.conf`：

```nginx
server {
    listen       80;
    listen  [::]:80;
    server_name  localhost;

    root   /usr/share/nginx/html;
    index  index.html index.htm;

    location /api {
        proxy_pass http://192.168.1.100:3000;
        proxy_set_header Host $proxy_host;
        proxy_set_header Origin "";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # 勾选「去除前缀」时启用：
        # rewrite ^/api/(.*) /$1 break;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 📝 运维命令

```bash
# 查看管理后台日志
docker logs -f frontend-deployer

# 查看某项目 Nginx 日志（含 upstream 信息）
docker logs -f <项目名称>

# 停止管理后台（已部署项目不受影响）
docker compose stop

# 清理所有
docker compose down
```

---

## 🔧 故障排查

| 问题 | 排查步骤 |
|---|---|
| 无法访问管理界面 | `docker ps \| grep frontend-deployer`、检查 4000 端口防火墙 |
| 部署后访问不到项目 | `docker logs <项目名>` 查看 nginx 日志，检查 `→ upstream_addr` 确认转发状态 |
| API 转发 403 | 先 curl 后端直连确认；检查后端地址是否含端口号；nginx 日志 `→` 后显示 `-` 则未转发、显示 IP 则已转发 |
| 容器启动失败 | 管理界面会直接显示 nginx 错误日志 |
| 端口冲突 | 换一个端口，或编辑已部署项目修改端口 |

---

## ⚠️ 安全注意

1. **Docker Socket**：挂载 `/var/run/docker.sock` 赋予容器完整 Docker 权限，勿暴露到公网
2. **端口管理**：仅放行必要的端口
3. **项目命名**：仅使用字母、数字、中划线

---

## 📄 License

MIT
