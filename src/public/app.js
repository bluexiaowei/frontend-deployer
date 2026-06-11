let proxyOpen = false;
let deleteTarget = '';
let editTarget = '';

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function toggleProxy() {
    proxyOpen = !proxyOpen;
    document.getElementById('proxyPanel').classList.toggle('open', proxyOpen);
    document.getElementById('proxyCaret').textContent = proxyOpen ? '▼' : '▶';
}

function toast(msg, isError) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast' + (isError ? ' error' : '') + ' show';
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 3000);
}

async function parseJsonResponse(res) {
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || res.statusText);
    }
    return data;
}

function closeModal() {
    document.getElementById('modal').classList.remove('open');
    deleteTarget = '';
}

function confirmDel(name) {
    deleteTarget = name;
    document.getElementById('delName').textContent = name;
    document.getElementById('modal').classList.add('open');
}

async function submitDelete() {
    if (!deleteTarget) return;
    try {
        const data = await parseJsonResponse(
            await fetch('/api/project/' + encodeURIComponent(deleteTarget), { method: 'DELETE' })
        );
        toast('✅ ' + data.message);
        loadList();
    } catch (e) {
        toast('删除失败: ' + e.message, true);
    }
    closeModal();
}

async function editProject(name) {
    editTarget = name;
    document.getElementById('editTitle').textContent = name;
    document.getElementById('editPort').value = '';
    document.getElementById('editBackend').value = '';
    document.getElementById('editPrefix').value = '/api';
    document.getElementById('editStrip').checked = false;
    document.getElementById('editFile').value = '';

    try {
        const meta = await parseJsonResponse(
            await fetch('/api/project/' + encodeURIComponent(name))
        );
        document.getElementById('editPort').value = meta.port || '';
        document.getElementById('editBackend').value = meta.backend || '';
        document.getElementById('editPrefix').value = meta.apiPrefix || '/api';
        document.getElementById('editStrip').checked = !!meta.stripPrefix;

        if (meta.backend) {
            document.getElementById('editProxyHint').textContent =
                `当前已配置 API 转发：${meta.apiPrefix || '/api'} → ${meta.backend}`;
        } else {
            document.getElementById('editProxyHint').textContent = '未配置 API 转发';
        }
    } catch (e) {
        document.getElementById('editProxyHint').textContent = '无法加载配置，请手动填写';
        toast('加载配置失败: ' + e.message, true);
    }

    document.getElementById('editModal').classList.add('open');
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('open');
    editTarget = '';
}

async function submitEdit() {
    if (!editTarget) return;

    const port = document.getElementById('editPort').value;
    const backend = document.getElementById('editBackend').value.trim();
    const apiPrefix = document.getElementById('editPrefix').value || '/api';
    const stripPrefix = document.getElementById('editStrip').checked;
    const file = document.getElementById('editFile').files[0];

    if (!port) {
        toast('请填写端口号', true);
        return;
    }

    const btn = document.getElementById('confirmEdit');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 保存中...';

    try {
        const fd = new FormData();
        fd.append('port', port);
        fd.append('backend', backend);
        fd.append('apiPrefix', apiPrefix);
        if (stripPrefix) fd.append('stripPrefix', '1');
        if (file) fd.append('file', file);

        const data = await parseJsonResponse(
            await fetch('/api/project/' + encodeURIComponent(editTarget), {
                method: 'PUT',
                body: fd,
            })
        );

        toast('✅ ' + data.message);
        closeEditModal();
        loadList();
    } catch (e) {
        toast('更新失败: ' + e.message, true);
    }

    btn.disabled = false;
    btn.innerHTML = '保存更改';
}

async function loadList() {
    const container = document.getElementById('listContainer');
    container.innerHTML = '<div class="empty"><div class="spinner" style="border-color:rgba(79,110,247,0.2);border-top-color:var(--primary);"></div></div>';

    try {
        const res = await fetch('/api/list');
        const data = await res.json();

        if (!data.length) {
            container.innerHTML = '<div class="empty"><div class="icon">📭</div><p>暂无已部署项目</p><p style="font-size:12px;margin-top:4px;">在上方填写信息并上传文件开始部署</p></div>';
            return;
        }

        const cards = await Promise.all(data.map(async (item) => {
            let proxyBadge = '';
            try {
                const metaRes = await fetch('/api/project/' + encodeURIComponent(item.name));
                if (metaRes.ok) {
                    const meta = await metaRes.json();
                    if (meta.backend) {
                        proxyBadge = `<span class="badge badge-proxy">🔀 ${escapeHtml(meta.apiPrefix || '/api')}</span>`;
                    }
                }
            } catch (_) { /* 忽略单个项目元数据加载失败 */ }

            const safeName = escapeHtml(item.name);
            const initial = (item.name || '?')[0].toUpperCase();

            return `
                <div class="project-card">
                    <div class="project-info">
                        <div class="project-avatar">${initial}</div>
                        <div>
                            <div class="project-name">${safeName}</div>
                            <div class="project-meta">
                                <span class="badge badge-running">● 运行中</span>
                                <a class="badge badge-port" href="http://${location.hostname}:${item.port}" target="_blank">:${item.port} ↗</a>
                                ${proxyBadge}
                            </div>
                        </div>
                    </div>
                    <div class="project-actions">
                        <a class="btn btn-sm btn-ghost" href="http://${location.hostname}:${item.port}" target="_blank">访问</a>
                        <button class="btn btn-sm btn-ghost" data-action="edit" data-name="${safeName}">编辑</button>
                        <button class="btn btn-sm btn-danger" data-action="delete" data-name="${safeName}">删除</button>
                    </div>
                </div>`;
        }));

        container.innerHTML = '<div class="project-list">' + cards.join('') + '</div>';

        container.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.onclick = () => editProject(btn.dataset.name);
        });
        container.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.onclick = () => confirmDel(btn.dataset.name);
        });
    } catch (e) {
        container.innerHTML = '<div class="empty"><p style="color:var(--danger);">加载失败，请刷新重试</p></div>';
    }
}

async function submitDeploy(e) {
    e.preventDefault();
    const form = e.target;
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 部署中...';

    const fd = new FormData(form);
    try {
        const data = await parseJsonResponse(
            await fetch('/deploy', { method: 'POST', body: fd })
        );
        toast('✅ ' + data.message);
        form.reset();
        document.getElementById('proxyPanel').classList.remove('open');
        proxyOpen = false;
        document.getElementById('proxyCaret').textContent = '▶';
        loadList();
    } catch (e) {
        toast('部署失败: ' + e.message, true);
    }

    btn.disabled = false;
    btn.innerHTML = '开始部署';
}

function init() {
    document.getElementById('deployForm').addEventListener('submit', submitDeploy);
    document.getElementById('confirmDel').addEventListener('click', submitDelete);
    document.getElementById('confirmEdit').addEventListener('click', submitEdit);

    document.getElementById('modal').addEventListener('click', (e) => {
        if (e.target.id === 'modal') closeModal();
    });
    document.getElementById('editModal').addEventListener('click', (e) => {
        if (e.target.id === 'editModal') closeEditModal();
    });
    document.getElementById('closeEditBtn').addEventListener('click', closeEditModal);
    document.getElementById('closeDelBtn').addEventListener('click', closeModal);
    document.getElementById('refreshList').addEventListener('click', loadList);
    document.getElementById('proxyToggle').addEventListener('click', toggleProxy);

    loadList();
}

init();
