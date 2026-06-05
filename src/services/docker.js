const { execSync } = require('child_process');
const { DOCKER_API, APP_LABEL } = require('../config');

/** 列出本系统管理的运行中容器 */
function listContainers() {
    const filter = `--filter "label=${APP_LABEL}"`;
    const result = execSync(
        `${DOCKER_API} docker ps ${filter} --format "{{.Names}}|{{.Ports}}" 2>/dev/null`
    ).toString();

    return result
        .trim()
        .split('\n')
        .filter(l => l)
        .map(line => {
            const [name, portInfo] = line.split('|');
            const portMatch = portInfo.match(/:(\d+)->/);
            return { name, port: portMatch ? portMatch[1] : 'unknown' };
        });
}

/** 删除容器 */
function removeContainer(name) {
    execSync(`${DOCKER_API} docker rm -f ${name}`, { stdio: 'ignore' });
}

/** 检查容器运行状态，异常时抛出含日志的错误 */
function checkContainerRunning(name) {
    const status = execSync(
        `${DOCKER_API} docker inspect --format "{{.State.Status}}" ${name}`
    ).toString().trim();

    if (status !== 'running') {
        const logs = execSync(
            `${DOCKER_API} docker logs --tail 20 ${name} 2>&1`
        ).toString();
        throw new Error(`容器状态: ${status}\nnginx 日志:\n${logs}`);
    }
}

/** 启动 nginx 容器并挂载静态文件 + 可选 nginx 配置目录 */
function runNginxContainer({ name, port, hostPath, nginxConfHostDir }) {
    let cmd = `${DOCKER_API} docker run -d \
        --name ${name} \
        --label ${APP_LABEL} \
        -p ${port}:80 \
        -v ${hostPath}:/usr/share/nginx/html:ro \
        --restart always`;

    if (nginxConfHostDir) {
        cmd += ` \\\n        -v ${nginxConfHostDir}:/etc/nginx/conf.d:ro`;
    }

    cmd += ` \\\n        nginx:alpine`;
    execSync(cmd);
}

module.exports = {
    listContainers,
    removeContainer,
    checkContainerRunning,
    runNginxContainer,
};
