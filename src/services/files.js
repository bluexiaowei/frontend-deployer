const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const admZip = require('adm-zip');
const { CONTAINER_DEPLOY_DIR } = require('../config');

/**
 * 安全清理目标目录
 * 优先使用 fs.rmSync，失败时用 rm -rf 兜底（需校验路径安全性）
 */
function cleanDir(targetDir) {
    try {
        fs.rmSync(targetDir, { recursive: true, force: true });
    } catch (_) {
        if (
            targetDir.startsWith(CONTAINER_DEPLOY_DIR + '/') &&
            targetDir.length > CONTAINER_DEPLOY_DIR.length + 1
        ) {
            execSync(`rm -rf ${targetDir}`, { stdio: 'ignore' });
        }
    }
}

/** 若 zip 内只有一层嵌套目录，则平铺到目标根目录 */
function flattenNestedDir(targetDir) {
    const items = fs.readdirSync(targetDir).filter(item => !item.startsWith('.'));
    if (!items.includes('index.html') && items.length === 1) {
        const subDir = path.join(targetDir, items[0]);
        if (fs.lstatSync(subDir).isDirectory()) {
            console.log(`[files] 检测到嵌套目录 ${items[0]}，正在平铺...`);
            fs.readdirSync(subDir).forEach(file => {
                fs.renameSync(path.join(subDir, file), path.join(targetDir, file));
            });
            fs.rmdirSync(subDir);
        }
    }
}

/**
 * 解压 zip 到已有目录（不清理目标目录）
 * @returns {string} 解压到的目标目录
 */
function extractZipContents(zipPath, targetDir) {
    fs.mkdirSync(targetDir, { recursive: true });

    const zip = new admZip(zipPath);
    zip.extractAllTo(targetDir, true);
    flattenNestedDir(targetDir);

    console.log(`[files] 解压完成 ${targetDir}:`, fs.readdirSync(targetDir));
    return targetDir;
}

/**
 * 解压 zip 并自动平铺嵌套目录（全新部署，清空目标目录）
 * @returns {string} 解压到的目标目录
 */
function extractZip(zipPath, targetDir) {
    cleanDir(targetDir);
    return extractZipContents(zipPath, targetDir);
}

/**
 * 更新已部署项目的静态资源，保留 nginx 配置与 deploy.json
 */
function updateProjectZip(zipPath, name) {
    const targetDir = path.join(CONTAINER_DEPLOY_DIR, name);
    if (!fs.existsSync(targetDir)) {
        throw new Error('项目不存在');
    }

    const meta = readMeta(name);
    const nginxConfPath = path.join(targetDir, 'nginx', 'default.conf');
    const nginxBackup = fs.existsSync(nginxConfPath)
        ? fs.readFileSync(nginxConfPath, 'utf-8')
        : null;

    cleanDir(targetDir);
    extractZipContents(zipPath, targetDir);

    if (nginxBackup) {
        const nginxDir = path.join(targetDir, 'nginx');
        fs.mkdirSync(nginxDir, { recursive: true });
        fs.writeFileSync(path.join(nginxDir, 'default.conf'), nginxBackup);
    }

    if (meta) {
        saveMeta(targetDir, meta);
    }

    console.log(`[files] 项目 ${name} 静态资源已更新`);
}

/**
 * 写入 nginx 配置到目标目录
 * @returns {{ hostDir: string }} 宿主机上 nginx 配置目录路径（用于 docker -v 挂载）
 */
function writeNginxConfig(targetDir, hostDir, content) {
    const nginxConfDir = path.join(targetDir, 'nginx');
    fs.mkdirSync(nginxConfDir, { recursive: true });
    fs.writeFileSync(path.join(nginxConfDir, 'default.conf'), content);

    return { hostDir: path.join(hostDir, 'nginx') };
}

/**
 * 删除项目目录
 */
function removeProjectDir(name) {
    const dir = path.join(CONTAINER_DEPLOY_DIR, name);
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true });
    }
}

/**
 * 保存项目部署元数据
 */
function saveMeta(targetDir, meta) {
    fs.writeFileSync(path.join(targetDir, 'deploy.json'), JSON.stringify(meta, null, 2));
}

/**
 * 读取项目部署元数据
 */
function readMeta(name) {
    const filePath = path.join(CONTAINER_DEPLOY_DIR, name, 'deploy.json');
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

module.exports = {
    extractZip,
    extractZipContents,
    updateProjectZip,
    writeNginxConfig,
    removeProjectDir,
    saveMeta,
    readMeta,
};
