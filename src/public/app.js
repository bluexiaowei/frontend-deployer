let modalMode = 'create'; // 'create' | 'edit'
let editTarget = '';
let deleteTarget = '';
let proxyOpen = false;

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function toast(msg, isError) {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'toast' + (isError ? ' error' : '') + ' show';
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 3000);
}

async function parseJsonResponse(res) {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
}

function setProxyOpen(open) {
    proxyOpen = open;
    $('proxyPanel').classList.toggle('open', open);
    $('proxyToggle').classList.toggle('open', open);
}

function updateFileDrop() {
    const input = $('fieldFile');
    const file = input.files[0];
    const drop = input.closest('.file-drop');
    const text = drop.querySelector('.file-drop-text');
    if (file) {
        drop.classList.add('has-file');
        text.textContent = file.name;
    } else {
        drop.classList.remove('has-file');
        text.textContent = '点击选择 zip 文件';
    }
}

function toggleProxy() {
    setProxyOpen(!proxyOpen);
}

function resetProjectForm() {
    $('projectForm').reset();
    $('fieldPrefix').value = '/api';
    $('fieldFile').required = false;
    setProxyOpen(false);
    updateFileDrop();
}

function setModalMode(mode) {
    modalMode = mode;
    const isEdit = mode === 'edit';

    $('projectModalIcon').textContent = isEdit ? '✏️' : '📦';
    $('projectModalTitle').textContent = isEdit ? '编辑项目' : '新建项目';

    const badge = $('projectModalBadge');
    if (isEdit) {
        badge.textContent = editTarget;
        badge.hidden = false;
    } else {
        badge.hidden = true;
    }

    $('projectModalHint').textContent = isEdit
        ? '修改配置或上传新的 dist.zip 即可更新，无需重新填写全部信息'
        : '填写项目信息并上传 zip 包，一键部署上线';
    $('fieldFileLabel').textContent = isEdit ? '更新 dist.zip（可选）' : '上传 dist.zip';
    $('fieldFileHint').textContent = isEdit
        ? '留空则仅更新端口 / API 转发配置，上传后将替换静态资源'
        : '上传前端构建产物压缩包，支持嵌套 dist 目录自动平铺';
    $('submitProjectBtn').textContent = isEdit ? '保存更改' : '开始部署';

    $('fieldName').readOnly = isEdit;
    $('fieldName').classList.toggle('input-readonly', isEdit);
    $('fieldFile').required = !isEdit;
}

function openCreateModal() {
    editTarget = '';
    resetProjectForm();
    setModalMode('create');
    $('projectModal').classList.add('open');
    $('fieldName').focus();
}

async function openEditModal(name) {
    editTarget = name;
    resetProjectForm();
    setModalMode('edit');

    $('fieldName').value = name;

    try {
        const meta = await parseJsonResponse(
            await fetch('/api/project/' + encodeURIComponent(name))
        );
        $('fieldPort').value = meta.port || '';
        $('fieldBackend').value = meta.backend || '';
        $('fieldPrefix').value = meta.apiPrefix || '/api';
        $('fieldStrip').checked = !!meta.stripPrefix;

        if (meta.backend) {
            setProxyOpen(true);
            $('projectModalHint').textContent =
                `当前 API 转发：${meta.apiPrefix || '/api'} → ${meta.backend}`;
        }
    } catch (e) {
        toast('加载配置失败: ' + e.message, true);
    }

    $('projectModal').classList.add('open');
    $('fieldPort').focus();
}

function closeProjectModal() {
    $('projectModal').classList.remove('open');
    editTarget = '';
    modalMode = 'create';
}

function openDeleteModal(name) {
    deleteTarget = name;
    $('delName').textContent = name;
    $('deleteModal').classList.add('open');
}

function closeDeleteModal() {
    $('deleteModal').classList.remove('open');
    deleteTarget = '';
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
    closeDeleteModal();
}

async function submitProject(e) {
    e.preventDefault();

    const name = $('fieldName').value.trim();
    const port = $('fieldPort').value;
    const backend = $('fieldBackend').value.trim();
    const apiPrefix = $('fieldPrefix').value || '/api';
    const stripPrefix = $('fieldStrip').checked;
    const file = $('fieldFile').files[0];

    if (!name) { toast('请填写项目名称', true); return; }
    if (!port) { toast('请填写端口号', true); return; }
    if (modalMode === 'create' && !file) { toast('请上传 zip 文件', true); return; }

    const btn = $('submitProjectBtn');
    const defaultText = modalMode === 'create' ? '开始部署' : '保存更改';
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> ' + (modalMode === 'create' ? '部署中...' : '保存中...');

    try {
        const fd = new FormData();
        fd.append('port', port);
        fd.append('backend', backend);
        fd.append('apiPrefix', apiPrefix);
        if (stripPrefix) fd.append('stripPrefix', '1');
        if (file) fd.append('file', file);

        let data;
        if (modalMode === 'create') {
            fd.append('name', name);
            data = await parseJsonResponse(await fetch('/deploy', { method: 'POST', body: fd }));
        } else {
            data = await parseJsonResponse(
                await fetch('/api/project/' + encodeURIComponent(editTarget), { method: 'PUT', body: fd })
            );
        }

        toast('✅ ' + data.message);
        closeProjectModal();
        loadList();
    } catch (err) {
        toast((modalMode === 'create' ? '部署' : '更新') + '失败: ' + err.message, true);
    }

    btn.disabled = false;
    btn.innerHTML = defaultText;
}

async function loadList() {
    const container = $('listContainer');
    container.innerHTML = '<div class="empty"><div class="spinner" style="border-color:rgba(79,110,247,0.2);border-top-color:var(--primary);"></div></div>';

    try {
        const data = await (await fetch('/api/list')).json();

        if (!data.length) {
            container.innerHTML = `
                <div class="empty">
                    <div class="icon">📭</div>
                    <p>暂无已部署项目</p>
                    <p class="form-hint" style="margin:8px 0 20px;">点击右上角「新建项目」开始部署</p>
                    <button class="btn btn-primary btn-inline" id="emptyCreateBtn">+ 新建项目</button>
                </div>`;
            $('emptyCreateBtn').onclick = openCreateModal;
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
            } catch (_) {}

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

        container.querySelectorAll('[data-action="edit"]').forEach((btn) => {
            btn.onclick = () => openEditModal(btn.dataset.name);
        });
        container.querySelectorAll('[data-action="delete"]').forEach((btn) => {
            btn.onclick = () => openDeleteModal(btn.dataset.name);
        });
    } catch (e) {
        container.innerHTML = '<div class="empty"><p style="color:var(--danger);">加载失败，请刷新重试</p></div>';
    }
}

function init() {
    $('projectForm').addEventListener('submit', submitProject);
    $('openCreateBtn').addEventListener('click', openCreateModal);
    $('closeProjectBtn').addEventListener('click', closeProjectModal);
    $('closeProjectX').addEventListener('click', closeProjectModal);
    $('confirmDel').addEventListener('click', submitDelete);
    $('closeDelBtn').addEventListener('click', closeDeleteModal);
    $('refreshList').addEventListener('click', loadList);
    $('proxyToggle').addEventListener('click', toggleProxy);
    $('fieldFile').addEventListener('change', updateFileDrop);

    $('projectModal').addEventListener('click', (e) => {
        if (e.target.id === 'projectModal') closeProjectModal();
    });
    $('deleteModal').addEventListener('click', (e) => {
        if (e.target.id === 'deleteModal') closeDeleteModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if ($('projectModal').classList.contains('open')) closeProjectModal();
        if ($('deleteModal').classList.contains('open')) closeDeleteModal();
    });

    loadList();
}

init();
