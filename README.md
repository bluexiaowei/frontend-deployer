# Frontend Deployer

轻量级前端部署工具。通过 Docker 管理 Nginx 容器，上传 zip 即可发布静态站点，支持 API 反向代理与在线更新。

## 特性

- 上传 zip 一键部署，自动平铺嵌套 `dist` 目录
- 统一弹窗管理新建 / 编辑，配置自动回填
- 编辑时可上传 `dist.zip` 热更新静态资源，无需重填信息
- 可选 API 转发（前缀、去前缀、changeOrigin）
- 仅管理本系统部署的项目（Docker Label）
- 零构建前端，管理后台容器化运行（DooD）

## 快速开始

**环境**：Docker 20.10+、Docker Compose、Linux

```bash
git clone <repo-url> && cd frontend-deployer
docker compose up -d --build
```

访问 `http://服务器IP:4000`

更新管理后台：

```bash
git pull && docker compose up -d --build
```

> 已部署的项目容器不受管理后台重启影响。`HOST_BASE_DIR` 默认自动检测，可通过环境变量覆盖。

## 使用

**新建**：点击「新建项目」→ 填写名称、端口 → 上传 zip →（可选）配置 API 转发 → 部署

**编辑**：修改端口 / 代理配置，或上传新 zip 更新资源。仅改配置会重建容器；仅更新文件则无需重启。

**删除**：确认后清理容器与项目文件。

### API 转发

| 参数 | 说明 |
|---|---|
| 后端地址 | 完整 URL，如 `http://192.168.1.100:3000` |
| 转发前缀 | 默认 `/api` |
| 去除前缀 | `/api/users` → `/users` |

## 项目结构

```
src/
  server.js          # Express 入口
  routes/            # 页面与 API 路由
  services/          # docker / nginx / files
  public/            # index.html、styles.css、app.js
docker-compose.yml
Dockerfile
```

## 运维

```bash
docker logs -f frontend-deployer          # 管理后台日志
docker logs -f <项目名>                  # 项目 Nginx 日志
docker compose stop                       # 停止管理后台
docker compose down                       # 停止并移除管理容器
```

## 故障排查

| 问题 | 处理 |
|---|---|
| 无法访问 :4000 | 检查容器状态与防火墙 |
| 部署后访问不到 | `docker logs <项目名>` |
| API 转发失败 | 确认后端地址含端口，curl 直连测试 |
| 端口冲突 | 编辑项目更换端口 |

## 安全

- 勿将管理界面（含 Docker Socket 权限）暴露到公网
- 仅开放必要端口
- 项目名仅用字母、数字、中划线

## License

MIT
