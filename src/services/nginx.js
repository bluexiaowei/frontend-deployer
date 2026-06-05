/**
 * 生成 nginx 反向代理配置
 * @param {{ prefix: string, backend: string, stripPrefix?: boolean }} params
 * @returns {string} nginx server 段配置字符串
 */
function generateNginxConfig({ prefix, backend, stripPrefix }) {
    const rewriteLine = stripPrefix
        ? `rewrite ^${prefix}/(.*) /$1 break;`
        : '# 保留前缀转发，如需去除请勾选「转发时去除前缀」';

    return `
# 自定义日志格式：标注请求是本地文件(→)还是代理转发(⇒)
log_format proxy '$remote_addr [$time_local] "$request" '
                  '$status $body_bytes_sent '
                  '→ $upstream_addr $upstream_status '
                  '"$http_referer" "$http_user_agent"';

server {
    listen       80;
    listen  [::]:80;
    server_name  localhost;

    access_log /var/log/nginx/access.log proxy;

    # 静态文件根目录
    root   /usr/share/nginx/html;
    index  index.html index.htm;

    # API 转发到后端
    location ${prefix} {
        proxy_pass ${backend};
        proxy_set_header Host $proxy_host;
        proxy_set_header Origin "";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 转发前缀处理
        ${rewriteLine}
    }

    # 其余请求走静态文件
    location / {
        try_files $uri $uri/ /index.html;
    }
}
`;
}

module.exports = { generateNginxConfig };
