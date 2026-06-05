const { execSync } = require('child_process');

// Docker API 版本兼容（CentOS 7 需指定）
const DOCKER_API = 'DOCKER_API_VERSION=1.43';

// 容器内挂载路径
const CONTAINER_DEPLOY_DIR = '/app/deployed_projects';

// 容器 Label，用于识别本系统管理的项目
const APP_LABEL = 'managed-by=frontend-deployer';

// HOST_BASE_DIR: 自动检测宿主机上 deployed_projects 的真实路径
// 通过 docker inspect 自身容器的 bind mount 获取 Source
let HOST_BASE_DIR = process.env.HOST_BASE_DIR;
if (!HOST_BASE_DIR) {
    try {
        const selfId = process.env.HOSTNAME;
        HOST_BASE_DIR = execSync(
            `${DOCKER_API} docker inspect ${selfId} --format "{{range .Mounts}}{{if eq .Destination \\"/app/deployed_projects\\"}}{{.Source}}{{end}}{{end}}"`
        ).toString().trim();
    } catch (_) {
        HOST_BASE_DIR = '/opt/frontend-deployer/deployed_projects';
    }
}

console.log(`[config] HOST_BASE_DIR = ${HOST_BASE_DIR}`);

module.exports = {
    DOCKER_API,
    CONTAINER_DEPLOY_DIR,
    APP_LABEL,
    HOST_BASE_DIR,
};
