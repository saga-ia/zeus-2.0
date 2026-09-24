// ============ STATE ============
let orgData = { tree: [], settings: {} };
let allNodes = [];
let activeNodeId = null;
let sidebarOpen = false;
let customDepartments = [];
let activeFilter = null;
let viewMode = 'blocks';

const DEPT_COLORS = [
  '#e63946','#2ec4b6','#3a86ff','#8338ec',
  '#ff9f1c','#06d6a0','#f77f00','#023e8a'
];

// ============ INIT ============
document.addEventListener('DOMContentLoaded', async () => {
  await loadOrg();
});

async function loadOrg() {
  const res = await fetch('/api/org');
  orgData = await res.json();
  allNodes = flattenTree(orgData.tree);

  const name = orgData.settings.company_name || 'Board Academy';
  document.getElementById('companyName').textContent = name;
  document.getElementById('topCompany').textContent = name;

  const raw = orgData.settings.custom_departments;
  customDepartments = raw ? JSON.parse(raw) : [];

  if (viewMode === 'blocks') renderBlocksView(orgData.tree);
  else renderTree(orgData.tree);
  populateParentSelect();
  populateLevelSelect();
  populateFilterChips();
}

function flattenTree(nodes, arr = []) {
  nodes.forEach(n => {
    arr.push(n);
    if (n.children?.length) flattenTree(n.children, arr);
  });
  return arr;
}

// ============ RENDER TREE ============
function renderTree(tree) {
  const container = document.getElementById('orgTree');
  container.innerHTML = '';

  if (!tree.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">&#128101;</div>
        <div class="empty-title">Organograma vazio</div>
        <div class="empty-sub">Clique em "+ Adicionar" para inserir a primeira pessoa</div>
      </div>`;
    return;
  }

  tree.forEach(node => {
    container.appendChild(renderNode(node, 0, null));
  });
}

let deptColorMap = {};
function getDeptColor(nodeId) {
  if (!deptColorMap[nodeId]) {
    const keys = Object.keys(deptColorMap);
    deptColorMap[nodeId] = DEPT_COLORS[keys.length % DEPT_COLORS.length];
  }
  return deptColorMap[nodeId];
}

function getAutoColor(node) {
  if (node.level === 'diretoria') return '#1a1a2e';
  if (node.level === 'gerencia') return '#457b9d';
  if (node.level === 'equipe') return '#2563eb';
  if (node.level === 'team') return '#7209b7';
  if (node.level === 'time') return '#6c757d';
  if (node.level === 'home') return '#94a3b8';
  if (node.level === 'departamento') return getDeptColor(node.id);
  const customDept = customDepartments.find(d => d.id === node.level);
  if (customDept) return customDept.color;
  return '#adb5bd';
}

function renderNode(node, depth, parentColor) {
  const wrap = document.createElement('div');
  wrap.className = 'org-node-wrap';
  wrap.dataset.id = node.id;

  const isSmall = ['gerencia', 'equipe', 'time', 'home', 'indireto'].includes(node.level);
  const color = node.color || getAutoColor(node);

  const initials = getInitials(node.name);
  const photoHtml = node.photo
    ? `<img src="${node.photo}" alt="${node.name}" loading="lazy">`
    : initials;

  const circleClass = `node-circle${isSmall ? ' node-circle-sm' : ''}`;
  const badgeClass = `node-badge${isSmall ? ' node-badge-sm' : ''}`;
  const nameClass = `node-name${isSmall ? ' node-name-sm' : ''}`;
  const roleClass = `node-role${isSmall ? ' node-role-sm' : ''}`;

  wrap.innerHTML = `
    <div class="org-node level-${node.level}" onclick="openModal(${node.id})">
      <div class="${circleClass}" style="border-color:${color}">${photoHtml}</div>
      <div class="${badgeClass}" style="background:${color}">
        <div class="${nameClass}">${node.name}</div>
        ${node.role ? `<div class="${roleClass}">${node.role}</div>` : ''}
      </div>
      <button class="btn-edit-node" title="Editar" onclick="event.stopPropagation();editNodeById(${node.id})">✏️</button>
    </div>
    <button class="btn-add-child" title="Adicionar abaixo" onclick="event.stopPropagation();openAddPanel(${node.id})">+</button>
  `;

  if (node.children?.length) {
    const childrenWrap = document.createElement('div');
    childrenWrap.className = 'node-children';

    // Line down
    const lineDown = document.createElement('div');
    lineDown.className = 'connector-down';
    childrenWrap.appendChild(lineDown);

    // Children row
    const row = document.createElement('div');
    row.className = 'level-row';
    node.children.forEach(child => {
      const childWrap = document.createElement('div');
      childWrap.style.display = 'flex';
      childWrap.style.flexDirection = 'column';
      childWrap.style.alignItems = 'center';

      // Line up to child
      const lineUp = document.createElement('div');
      lineUp.className = 'connector-down';
      lineUp.style.height = '20px';
      childWrap.appendChild(lineUp);
      childWrap.appendChild(renderNode(child, depth + 1, color));
      row.appendChild(childWrap);
    });

    // Horizontal line between children (if > 1)
    if (node.children.length > 1) {
      const hLineWrap = document.createElement('div');
      hLineWrap.className = 'connector-h-wrap';
      hLineWrap.style.width = '100%';
      hLineWrap.style.position = 'relative';
      hLineWrap.style.height = '2px';
      hLineWrap.style.marginBottom = '0';

      childrenWrap.appendChild(hLineWrap);

      // After row is added to DOM we'll draw the line - use ResizeObserver
      childrenWrap.appendChild(row);

      requestAnimationFrame(() => {
        const children = row.querySelectorAll(':scope > div');
        if (children.length < 2) return;
        const rowRect = row.getBoundingClientRect();
        const first = children[0].getBoundingClientRect();
        const last = children[children.length - 1].getBoundingClientRect();
        const left = (first.left + first.width / 2) - rowRect.left;
        const right = rowRect.right - (last.left + last.width / 2);
        const line = document.createElement('div');
        line.style.cssText = `position:absolute;top:0;left:${left}px;right:${right}px;height:2px;background:#cbd5e1;`;
        hLineWrap.appendChild(line);
      });
    } else {
      childrenWrap.appendChild(row);
    }

    wrap.appendChild(childrenWrap);
  }

  return wrap;
}

function getInitials(name) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

// ============ MODAL ============
function openModal(id) {
  activeNodeId = id;
  const node = allNodes.find(n => n.id === id);
  if (!node) return;

  const color = node.color || getAutoColor(node);

  const avatar = document.getElementById('modalAvatar');
  avatar.style.borderColor = color;
  avatar.innerHTML = node.photo
    ? `<img src="${node.photo}" alt="${node.name}">`
    : getInitials(node.name);

  document.getElementById('modalName').textContent = node.name;
  document.getElementById('modalRole').textContent = node.role || '';

  const badge = document.getElementById('modalBadge');
  badge.textContent = levelLabel(node.level);
  badge.style.background = color;

  const contacts = document.getElementById('modalContacts');
  contacts.innerHTML = '';
  if (node.whatsapp) contacts.innerHTML += `<div class="contact-row"><span class="contact-icon">💬</span><a href="https://wa.me/${node.whatsapp}">${node.whatsapp}</a></div>`;
  if (node.phone) contacts.innerHTML += `<div class="contact-row"><span class="contact-icon">📞</span>${node.phone}</div>`;
  if (node.email) contacts.innerHTML += `<div class="contact-row"><span class="contact-icon">✉️</span><a href="mailto:${node.email}">${node.email}</a></div>`;

  const children = allNodes.filter(n => n.parent_id === id);
  const childrenDiv = document.getElementById('modalChildren');
  if (children.length) {
    childrenDiv.innerHTML = `<h4>Reportam para esta pessoa (${children.length})</h4>`;
    children.forEach(c => {
      const pill = document.createElement('span');
      pill.className = 'child-pill';
      pill.textContent = c.name;
      pill.onclick = () => { closeModal(); openModal(c.id); };
      childrenDiv.appendChild(pill);
    });
  } else {
    childrenDiv.innerHTML = '';
  }

  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

function levelLabel(level) {
  const map = {
    diretoria: 'Diretoria', departamento: 'Departamento',
    gerencia: 'Gerência', equipe: 'Equipe',
    team: 'Grupo de Equipe', time: 'Time', home: 'Home Office', indireto: 'Indireto'
  };
  if (map[level]) return map[level];
  const customDept = customDepartments.find(d => d.id === level);
  return customDept ? customDept.name : level;
}

// ============ SIDEBAR / FORM ============
function toggleSidebar() { sidebarOpen ? closeSidebar() : openSidebar(); }
function showSidebarView(view) {
  document.getElementById('sidebarNav').style.display = view === 'nav' ? '' : 'none';
  document.getElementById('personFormSection').style.display = view === 'person' ? '' : 'none';
  document.getElementById('deptFormSection').style.display = view === 'dept' ? '' : 'none';
}
function openSidebar(view = 'nav') { document.getElementById('sidebar').classList.add('open'); sidebarOpen = true; showSidebarView(view); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); sidebarOpen = false; }

function openAddPanel(parentId) {
  clearForm();
  if (parentId) {
    document.getElementById('fParent').value = parentId;
    const parent = allNodes.find(n => n.id === parentId);
    if (parent) {
      const nextLevel = { diretoria: 'gerencia', gerencia: 'equipe', equipe: 'time', time: 'home', home: 'home' };
      document.getElementById('fLevel').value = nextLevel[parent.level] || 'equipe';
    }
    openSidebar('person');
  } else {
    openSidebar('nav');
  }
}

function clearForm() {
  document.getElementById('editId').value = '';
  document.getElementById('fName').value = '';
  document.getElementById('fRole').value = '';
  document.getElementById('fLevel').value = 'equipe';
  document.getElementById('newDeptForm')?.style && (document.getElementById('newDeptForm').style.display = 'none');
  document.getElementById('fParent').value = '';
  document.getElementById('fWhatsapp').value = '';
  document.getElementById('fPhone').value = '';
  document.getElementById('fEmail').value = '';
  document.getElementById('fColor').value = '#4361ee';
  document.getElementById('fColorCustom').checked = false;
  document.getElementById('colorAutoLabel').textContent = 'Cor padrão do nível';
  document.getElementById('colorAutoLabel').style.color = '#94a3b8';
  document.getElementById('photoGroup').style.display = 'none';
  document.getElementById('btnSubmit').textContent = 'Adicionar';
  document.getElementById('fTeamGroup').value = '';
  document.getElementById('teamGroupField').style.display = 'none';
}

function populateParentSelect() {
  const sel = document.getElementById('fParent');
  const current = sel.value;
  sel.innerHTML = '<option value="">— Raiz (sem superior) —</option>';
  allNodes.forEach(n => {
    const opt = document.createElement('option');
    opt.value = n.id;
    opt.textContent = `${n.name} (${levelLabel(n.level)})`;
    sel.appendChild(opt);
  });
  sel.value = current;
}

async function submitNode(e) {
  e.preventDefault();
  const editId = document.getElementById('editId').value;
  const useCustomColor = document.getElementById('fColorCustom').checked;
  const payload = {
    name: document.getElementById('fName').value.trim(),
    role: document.getElementById('fRole').value.trim(),
    level: document.getElementById('fLevel').value,
    parent_id: document.getElementById('fParent').value || null,
    phone: document.getElementById('fPhone').value.trim(),
    whatsapp: document.getElementById('fWhatsapp').value.trim(),
    email: document.getElementById('fEmail').value.trim(),
    color: useCustomColor ? document.getElementById('fColor').value : '',
  };

  let nodeId;
  if (editId) {
    const res = await fetch(`/api/nodes/${editId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    nodeId = data.id;
  } else {
    const res = await fetch('/api/nodes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    nodeId = data.id;
  }

  // Upload photo if selected
  const photoInput = document.getElementById('fPhoto');
  if (photoInput.files?.length && nodeId) {
    const formData = new FormData();
    formData.append('photo', photoInput.files[0]);
    await fetch(`/api/nodes/${nodeId}/photo`, { method: 'POST', body: formData });
  }

  closeSidebar();
  clearForm();
  await loadOrg();
}

// ============ MODAL ACTIONS ============
function fillEditForm(node) {
  document.getElementById('editId').value = node.id;
  document.getElementById('fName').value = node.name;
  document.getElementById('fRole').value = node.role || '';
  document.getElementById('fLevel').value = node.level;
  document.getElementById('fParent').value = node.parent_id || '';
  document.getElementById('fWhatsapp').value = node.whatsapp || '';
  document.getElementById('fPhone').value = node.phone || '';
  document.getElementById('fEmail').value = node.email || '';
  const hasColor = node.color && node.color !== '';
  document.getElementById('fColorCustom').checked = hasColor;
  document.getElementById('fColor').value = hasColor ? node.color : getAutoColor(node);
  const label = document.getElementById('colorAutoLabel');
  if (hasColor) {
    label.textContent = 'Cor personalizada ✓';
    label.style.color = '#06d6a0';
  } else {
    label.textContent = 'Cor padrão do nível';
    label.style.color = '#94a3b8';
  }
  document.getElementById('photoGroup').style.display = 'block';
  document.getElementById('btnSubmit').textContent = 'Salvar';

  const isEquipeLevel = ['equipe', 'time', 'home'].includes(node.level);
  document.getElementById('teamGroupField').style.display = isEquipeLevel ? '' : 'none';
  if (isEquipeLevel) {
    populateTeamSelect();
    const parent = allNodes.find(n => n.id === node.parent_id);
    document.getElementById('fTeamGroup').value = (parent && parent.level === 'team') ? parent.id : '';
  }
}

function editNode() {
  const node = allNodes.find(n => n.id === activeNodeId);
  if (!node) return;
  closeModal();
  fillEditForm(node);
  openSidebar('person');
}

function editNodeById(id) {
  activeNodeId = id;
  const node = allNodes.find(n => n.id === id);
  if (!node) return;
  fillEditForm(node);
  openSidebar('person');
}

async function deleteNode() {
  const node = allNodes.find(n => n.id === activeNodeId);
  if (!node) return;
  const children = allNodes.filter(n => n.parent_id === activeNodeId);
  const warn = children.length ? ` e mais ${children.length} pessoa(s) abaixo dela` : '';
  if (!confirm(`Remover "${node.name}"${warn}?`)) return;
  await fetch(`/api/nodes/${activeNodeId}`, { method: 'DELETE' });
  closeModal();
  await loadOrg();
}

// ============ EXPORT / IMPORT ============
function exportData() {
  const blob = new Blob([JSON.stringify({ nodes: allNodes, settings: orgData.settings }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'board-academy-org.json'; a.click();
  URL.revokeObjectURL(url);
}

async function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const data = JSON.parse(text);

  if (!confirm(`Importar ${data.nodes?.length || 0} nós? O organograma atual será substituído.`)) return;

  // Delete all existing
  const existing = await fetch('/api/nodes').then(r => r.json());
  const roots = existing.filter(n => !n.parent_id);
  for (const n of roots) await fetch(`/api/nodes/${n.id}`, { method: 'DELETE' });

  // Re-insert respecting parent hierarchy
  const idMap = {};
  const ordered = topoSort(data.nodes || []);
  for (const n of ordered) {
    const res = await fetch('/api/nodes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...n, parent_id: n.parent_id ? idMap[n.parent_id] : null })
    });
    const created = await res.json();
    idMap[n.id] = created.id;
  }

  e.target.value = '';
  await loadOrg();
}

function topoSort(nodes) {
  const result = [], visited = new Set();
  const map = Object.fromEntries(nodes.map(n => [n.id, n]));
  function visit(n) {
    if (visited.has(n.id)) return;
    if (n.parent_id && map[n.parent_id]) visit(map[n.parent_id]);
    visited.add(n.id); result.push(n);
  }
  nodes.forEach(n => visit(n));
  return result;
}

// ============ COLOR HELPERS ============
function onColorPick() {
  document.getElementById('fColorCustom').checked = true;
  document.getElementById('colorAutoLabel').textContent = 'Cor personalizada ✓';
  document.getElementById('colorAutoLabel').style.color = '#06d6a0';
}

function resetColor() {
  document.getElementById('fColor').value = '#4361ee';
  document.getElementById('fColorCustom').checked = false;
  document.getElementById('colorAutoLabel').textContent = 'Cor padrão do nível';
  document.getElementById('colorAutoLabel').style.color = '#94a3b8';
}

// ============ FILTRO POR NÍVEL / EQUIPE ============
function populateFilterChips() {
  const chipsContainer = document.getElementById('filterChips');
  chipsContainer.innerHTML = '';

  const standardLevels = [
    { id: 'diretoria', label: 'Diretoria' },
    { id: 'gerencia', label: 'Gerência' },
    { id: 'equipe', label: 'Equipe' },
    { id: 'time', label: 'Time' },
    { id: 'home', label: 'Home Office' },
  ];

  standardLevels.forEach(({ id, label }) => {
    if (!allNodes.some(n => n.level === id)) return;
    const chip = document.createElement('button');
    chip.className = 'filter-chip' + (activeFilter === id ? ' active' : '');
    chip.dataset.filter = id;
    chip.textContent = label;
    chip.onclick = () => setFilter(activeFilter === id ? null : id);
    chipsContainer.appendChild(chip);
  });

  customDepartments.forEach(d => {
    if (!allNodes.some(n => n.level === d.id)) return;
    const chip = document.createElement('button');
    chip.className = 'filter-chip' + (activeFilter === d.id ? ' active' : '');
    chip.dataset.filter = d.id;
    chip.textContent = d.name;
    chip.style.setProperty('--chip-color', d.color);
    if (activeFilter === d.id) {
      chip.style.background = d.color;
      chip.style.borderColor = d.color;
    } else {
      chip.style.borderColor = d.color;
      chip.style.color = d.color;
    }
    chip.onclick = () => setFilter(activeFilter === d.id ? null : d.id);
    chipsContainer.appendChild(chip);
  });
}

function setFilter(filter) {
  activeFilter = filter;

  document.getElementById('filterAll').classList.toggle('active', filter === null);
  document.querySelectorAll('#filterChips .filter-chip').forEach(chip => {
    const isActive = chip.dataset.filter === filter;
    chip.classList.toggle('active', isActive);
    const dept = customDepartments.find(d => d.id === chip.dataset.filter);
    if (dept) {
      chip.style.background = isActive ? dept.color : '';
      chip.style.color = isActive ? 'white' : dept.color;
      chip.style.borderColor = dept.color;
    }
  });

  const label = document.getElementById('filterLabel');
  if (filter !== null) {
    label.style.display = 'block';
    label.textContent = 'Exibindo: ' + levelLabel(filter);
  } else {
    label.style.display = 'none';
  }

  if (filter === null) {
    if (viewMode === 'blocks') renderBlocksView(orgData.tree);
    else renderTree(orgData.tree);
  } else {
    renderFilteredView(filter);
  }
}

function findInTree(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const found = findInTree(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function renderFilteredView(filter) {
  const container = document.getElementById('orgTree');
  container.innerHTML = '';

  const matches = allNodes.filter(n => n.level === filter);
  if (!matches.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">&#128269;</div>
        <div class="empty-title">Nenhum membro neste nível</div>
        <div class="empty-sub">Adicione pessoas com o nível "${levelLabel(filter)}"</div>
      </div>`;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'filter-grid';

  matches.forEach(node => {
    const treeNode = findInTree(orgData.tree, node.id);
    if (treeNode) grid.appendChild(renderNode(treeNode, 0, null));
  });

  container.appendChild(grid);
}

// ============ TEAM GROUP SELECT ============
function populateTeamSelect() {
  const sel = document.getElementById('fTeamGroup');
  const current = sel.value;
  sel.innerHTML = '<option value="">— Sem grupo específico —</option>';
  const teamNodes = allNodes.filter(n => n.level === 'team');
  teamNodes.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    sel.appendChild(opt);
  });
  if (current && [...sel.options].find(o => o.value === String(current))) {
    sel.value = current;
  }
}

function onTeamGroupChange() {
  const teamId = document.getElementById('fTeamGroup').value;
  if (teamId) document.getElementById('fParent').value = teamId;
}

// ============ CONEXÃO HIERÁRQUICA ============
let connectState = { nodeId: null, type: null, parentId: null };

function openConnectModal() {
  closeModal();
  connectState = { nodeId: activeNodeId, type: null, parentId: null };
  document.getElementById('connectOverlay').classList.add('open');
  showConnectStep('type');
}

function closeConnectModal() {
  document.getElementById('connectOverlay').classList.remove('open');
}

function showConnectStep(step) {
  document.getElementById('connectStep').style.display = step === 'type' ? 'block' : 'none';
  document.getElementById('selectParentStep').style.display = step === 'parent' ? 'block' : 'none';
  document.getElementById('confirmStep').style.display = step === 'confirm' ? 'block' : 'none';
}

function selectConnectType(type) {
  connectState.type = type;
  const label = type === 'diretoria' ? 'Selecione uma diretoria:' : 'Selecione uma equipe:';
  document.getElementById('selectParentLabel').textContent = label;

  const parentList = document.getElementById('parentList');
  parentList.innerHTML = '';

  const matches = allNodes.filter(n => n.level === type && n.id !== connectState.nodeId);
  matches.forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost';
    btn.style.cssText = 'justify-content:flex-start;padding:12px;border:1px solid #ccc';
    btn.textContent = m.name;
    btn.onclick = () => selectParent(m.id, m.name);
    parentList.appendChild(btn);
  });

  showConnectStep('parent');
}

function selectParent(parentId, parentName) {
  connectState.parentId = parentId;
  const node = allNodes.find(n => n.id === connectState.nodeId);
  const confirmText = `Conectar "${node.name}" a "${parentName}"?`;
  document.getElementById('confirmText').textContent = confirmText;
  showConnectStep('confirm');
}

function backToTypeSelect() {
  connectState.type = null;
  connectState.parentId = null;
  showConnectStep('type');
}

function backToParentSelect() {
  connectState.parentId = null;
  showConnectStep('parent');
}

async function confirmConnection() {
  const { nodeId, parentId } = connectState;
  if (!nodeId || !parentId) return;

  await fetch(`/api/nodes/${nodeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent_id: parentId })
  });

  closeConnectModal();
  await loadOrg();
}

// ============ NÍVEL / DEPARTAMENTOS PERSONALIZADOS ============
function populateLevelSelect() {
  const sel = document.getElementById('fLevel');
  const current = sel.value;
  sel.innerHTML = `
    <option value="diretoria">Diretoria</option>
    <option value="gerencia">Gerência</option>
    <option value="equipe">Equipe</option>
    <option value="team">Grupo de Equipe (container)</option>
    <option value="time">Time</option>
    <option value="home">Home Office</option>
  `;
  if (current && [...sel.options].find(o => o.value === current)) {
    sel.value = current;
  } else {
    sel.value = 'equipe';
  }
}

function onLevelChange() {
  const val = document.getElementById('fLevel').value;
  const equipeLevel = ['equipe', 'time', 'home'].includes(val);
  const teamGroupField = document.getElementById('teamGroupField');
  teamGroupField.style.display = equipeLevel ? '' : 'none';
  if (equipeLevel) populateTeamSelect();
}

function cancelNewDept() {
  document.getElementById('fLevel').value = 'equipe';
}

async function createDepartment() {
  const name = document.getElementById('newDeptName').value.trim();
  const color = document.getElementById('newDeptColor').value;
  if (!name) { document.getElementById('newDeptName').focus(); return; }

  const id = 'dept_' + Date.now();
  customDepartments.push({ id, name, color });
  await saveDepts();

  populateLevelSelect();
  document.getElementById('fLevel').value = id;
  document.getElementById('newDeptForm').style.display = 'none';
  document.getElementById('newDeptName').value = '';
}

function openDeptManager() {
  renderDeptManager();
  document.getElementById('deptManagerOverlay').classList.add('open');
}

function closeDeptManager() {
  document.getElementById('deptManagerOverlay').classList.remove('open');
}

function renderDeptManager() {
  const list = document.getElementById('deptManagerList');
  if (!customDepartments.length) {
    list.innerHTML = '<p style="color:#94a3b8;font-size:13px;text-align:center;padding:16px 0">Nenhum departamento personalizado ainda.<br>Crie um via o seletor de Nível.</p>';
    return;
  }
  list.innerHTML = '';
  customDepartments.forEach(d => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;background:#f8fafc;margin-bottom:8px;border:1px solid #e2e8f0';
    row.innerHTML = `
      <div style="width:20px;height:20px;border-radius:50%;background:${d.color};flex-shrink:0;border:1px solid rgba(0,0,0,.1)"></div>
      <span style="flex:1;font-size:14px;font-weight:600;color:#1e293b">${d.name}</span>
      <input type="color" value="${d.color}"
        onchange="updateDeptColor('${d.id}', this.value)"
        title="Mudar cor"
        style="width:32px;height:28px;border-radius:4px;border:1px solid #e2e8f0;cursor:pointer;padding:2px">
      <button onclick="deleteDept('${d.id}')"
        style="background:none;border:none;cursor:pointer;color:#ef233c;font-size:18px;line-height:1;padding:2px 6px;border-radius:4px"
        title="Remover">&#10005;</button>
    `;
    list.appendChild(row);
  });
}

async function updateDeptColor(id, color) {
  const d = customDepartments.find(x => x.id === id);
  if (!d) return;
  d.color = color;
  await saveDepts();
  await loadOrg();
  renderDeptManager();
}

async function deleteDept(id) {
  if (!confirm('Remover este departamento?')) return;
  customDepartments = customDepartments.filter(d => d.id !== id);
  await saveDepts();
  await loadOrg();
  renderDeptManager();
}

async function saveDepts() {
  await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ custom_departments: JSON.stringify(customDepartments) })
  });
}

async function submitDeptForm(e) {
  e.preventDefault();
  const name = document.getElementById('deptFName').value.trim();
  const description = document.getElementById('deptFDesc').value.trim();
  const hierarchy = document.getElementById('deptFHierarchy').value;
  const color = document.getElementById('deptFColor').value;
  if (!name) { document.getElementById('deptFName').focus(); return; }

  const id = 'dept_' + Date.now();
  customDepartments.push({ id, name, description, hierarchy, color });
  await saveDepts();

  document.getElementById('deptFName').value = '';
  document.getElementById('deptFDesc').value = '';
  document.getElementById('deptFHierarchy').value = 'diretoria';
  document.getElementById('deptFColor').value = '#3a86ff';

  populateLevelSelect();
  showSidebarView('nav');
}

// ============ BLOCK VIEW ============
function setViewMode(mode) {
  viewMode = mode;
  document.getElementById('btnViewTree').classList.toggle('active', mode === 'tree');
  document.getElementById('btnViewBlocks').classList.toggle('active', mode === 'blocks');
  if (activeFilter !== null) return; // keep filtered view as-is
  if (mode === 'blocks') renderBlocksView(orgData.tree);
  else renderTree(orgData.tree);
}

function renderBlockHeader(node, size = 80) {
  const color = node.color || getAutoColor(node);
  const wrap = document.createElement('div');
  wrap.className = 'block-company-header';
  wrap.style.position = 'relative';
  wrap.onclick = () => openModal(node.id);
  const fs = Math.round(size * 0.35);
  wrap.innerHTML = `
    <div class="org-node level-${node.level}" style="position:relative">
      <div class="node-circle" style="border-color:${color};width:${size}px;height:${size}px;font-size:${fs}px">
        ${node.photo ? `<img src="${node.photo}" alt="${node.name}" loading="lazy">` : getInitials(node.name)}
      </div>
      <div class="node-badge" style="background:${color}">
        <div class="node-name">${node.name}</div>
        ${node.role ? `<div class="node-role">${node.role}</div>` : ''}
      </div>
      <button class="btn-edit-node" title="Editar" onclick="event.stopPropagation();editNodeById(${node.id})">✏️</button>
    </div>
  `;
  return wrap;
}

// Camadas fixas do organograma (faixas horizontais empilhadas)
const ORG_LAYERS = [
  { key: 'diretoria', label: 'DIRETORIA', color: '#1a1a2e', levels: ['diretoria'], always: true },
  { key: 'gestao',    label: 'GESTÃO',   color: '#457b9d', levels: ['gestao', 'gerencia'], always: true },
];

// Nível usado ao cadastrar membro direto em cada faixa
const LAYER_ADD_LEVEL = { diretoria: 'diretoria', gestao: 'gerencia' };

function addToLayer(layerKey) {
  clearForm();
  document.getElementById('fLevel').value = LAYER_ADD_LEVEL[layerKey] || 'equipe';
  const firstOwner = orgData.tree[0];
  if (firstOwner) document.getElementById('fParent').value = firstOwner.id;
  openSidebar('person');
}

function editLayer(layerKey) {
  setFilter(LAYER_ADD_LEVEL[layerKey] || layerKey);
}

function layerKeyOf(node) {
  for (const layer of ORG_LAYERS) {
    if (layer.levels.includes(node.level)) return layer.key;
  }
  const dept = customDepartments.find(d => d.id === node.level);
  if (dept && dept.hierarchy && ORG_LAYERS.some(l => l.key === dept.hierarchy)) {
    return dept.hierarchy;
  }
  return 'gestao';
}

function collectDescendants(node, arr = []) {
  (node.children || []).forEach(c => { arr.push(c); collectDescendants(c, arr); });
  return arr;
}

function renderLayerBand(layer, members) {
  const block = document.createElement('div');
  block.className = 'dept-block';
  block.style.borderColor = layer.color;

  const header = document.createElement('div');
  header.className = 'dept-block-header';
  header.style.background = layer.color;
  header.innerHTML = `
    <span class="dept-block-title">${layer.label}</span>
    <button class="btn-edit-node" title="Editar ${layer.label}" onclick="event.stopPropagation();editLayer('${layer.key}')">✏️</button>
    <button class="btn-layer-add" title="Cadastrar membro em ${layer.label}" onclick="event.stopPropagation();addToLayer('${layer.key}')">+</button>
  `;
  block.appendChild(header);

  const wrap = document.createElement('div');
  wrap.className = 'dept-members';
  if (members.length) {
    members.forEach(m => wrap.appendChild(renderMemberBubble(m)));
  } else {
    wrap.innerHTML = '<div class="dept-empty">Nenhum cadastrado nesta camada</div>';
  }
  block.appendChild(wrap);
  return block;
}

// Banda DEPARTAMENTOS: cada departamento vira um container com suas pessoas aninhadas dentro.
function renderDeptBand(layer, deptNodes) {
  const block = document.createElement('div');
  block.className = 'dept-block';
  block.style.borderColor = layer.color;

  const header = document.createElement('div');
  header.className = 'dept-block-header';
  header.style.background = layer.color;
  header.innerHTML = `
    <span class="dept-block-title">${layer.label}</span>
    <button class="btn-edit-node" title="Editar DEPARTAMENTOS" onclick="event.stopPropagation();editLayer('${layer.key}')">✏️</button>
    <button class="btn-layer-add" title="Novo departamento" onclick="event.stopPropagation();openNewDeptModal()">+</button>
  `;
  block.appendChild(header);

  const wrap = document.createElement('div');
  wrap.className = 'dept-members';
  wrap.style.flexDirection = 'row';
  wrap.style.flexWrap = 'wrap';
  wrap.style.gap = '40px';
  wrap.style.alignItems = 'flex-start';
  wrap.style.justifyContent = 'center';
  wrap.style.padding = '24px';

  if (deptNodes.length) {
    deptNodes.forEach(d => wrap.appendChild(renderDeptContainer(d)));
  } else {
    wrap.innerHTML = '<div class="dept-empty">Nenhum departamento. Use o + para criar.</div>';
  }

  block.appendChild(wrap);
  return block;
}

function renderDeptContainer(deptNode) {
  const color = deptNode.color || getAutoColor(deptNode);

  const col = document.createElement('div');
  col.style.cssText = 'display:flex;flex-direction:column;align-items:center';

  // Retângulo do departamento — isolado, sem borda externa encapsulando as equipes
  const deptBox = document.createElement('div');
  deptBox.style.cssText = `background:${color};padding:10px 18px;border-radius:8px;display:flex;align-items:center;gap:8px;cursor:pointer;min-width:160px;justify-content:center;position:relative`;
  deptBox.onclick = () => openModal(deptNode.id);
  deptBox.innerHTML = `
    <span style="font-size:13px;font-weight:700;color:white;letter-spacing:.05em;text-transform:uppercase;flex:1;text-align:center">${deptNode.name}</span>
    <button class="btn-edit-node" title="Editar departamento" onclick="event.stopPropagation();editNodeById(${deptNode.id})">✏️</button>
    <button class="btn-layer-add" title="Cadastrar equipe neste departamento" onclick="event.stopPropagation();openAddPanel(${deptNode.id})">+</button>
  `;
  col.appendChild(deptBox);

  const kids = allNodes.filter(n => n.parent_id === deptNode.id);
  if (kids.length) {
    const connDown = document.createElement('div');
    connDown.className = 'connector-down';
    connDown.style.height = '20px';
    col.appendChild(connDown);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:16px;align-items:flex-start;justify-content:center;flex-wrap:wrap';
    kids.forEach(k => row.appendChild(renderTeamRect(k)));
    col.appendChild(row);
  }

  return col;
}

// Retângulo de equipe — fora do retângulo do departamento
function renderTeamRect(node) {
  const color = node.color || getAutoColor(node);

  const col = document.createElement('div');
  col.style.cssText = 'display:flex;flex-direction:column;align-items:center';

  const box = document.createElement('div');
  box.style.cssText = `border:2px solid ${color};border-radius:10px;overflow:hidden;min-width:140px;background:rgba(255,255,255,.04)`;

  const header = document.createElement('div');
  header.style.cssText = `background:${color};padding:8px 12px;display:flex;align-items:center;gap:6px;cursor:pointer`;
  header.onclick = () => openModal(node.id);
  header.innerHTML = `
    <span style="font-size:12px;font-weight:700;color:white;letter-spacing:.04em;flex:1;text-align:center;text-transform:uppercase">${node.name}</span>
    <button class="btn-edit-node" title="Editar" onclick="event.stopPropagation();editNodeById(${node.id})">✏️</button>
    <button class="btn-layer-add" title="Adicionar" onclick="event.stopPropagation();openAddPanel(${node.id})">+</button>
  `;
  box.appendChild(header);

  const kids = allNodes.filter(n => n.parent_id === node.id);
  if (kids.length) {
    const body = document.createElement('div');
    body.style.cssText = 'padding:12px;display:flex;flex-wrap:wrap;gap:12px;justify-content:center';
    kids.forEach(k => body.appendChild(renderMemberTree(k)));
    box.appendChild(body);
  }

  col.appendChild(box);
  return col;
}

// Pessoa + subordinados aninhados abaixo (cada bolinha tem + lateral e + embaixo).
function renderMemberTree(node) {
  const col = document.createElement('div');
  col.style.cssText = 'display:flex;flex-direction:column;align-items:center';
  col.appendChild(renderMemberBubble(node, true));

  const kids = allNodes.filter(n => n.parent_id === node.id);
  if (kids.length) {
    const conn = document.createElement('div');
    conn.className = 'connector-down';
    conn.style.height = '20px';
    col.appendChild(conn);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:28px;align-items:flex-start;justify-content:center;flex-wrap:wrap';
    kids.forEach(k => row.appendChild(renderMemberTree(k)));
    col.appendChild(row);
  }
  return col;
}

function addSibling(nodeId) {
  const node = allNodes.find(n => n.id === nodeId);
  if (!node) return;
  clearForm();
  document.getElementById('fLevel').value = node.level === 'team' ? 'team' : node.level;
  document.getElementById('fParent').value = node.parent_id || '';
  openSidebar('person');
}

function renderBlocksView(tree) {
  const container = document.getElementById('orgTree');
  container.innerHTML = '';

  if (!tree.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">&#128101;</div>
        <div class="empty-title">Organograma vazio</div>
        <div class="empty-sub">Clique em "+ Adicionar" para inserir a primeira pessoa</div>
      </div>`;
    return;
  }

  const stack = document.createElement('div');
  stack.className = 'block-view-stack';

  // Todos os nós em lista plana
  const all = collectDescendants({ children: tree });

  // 1) Donos no topo: nós raiz de nível diretoria (cabeça da empresa).
  //    Se nenhuma raiz for diretoria, cai pra todas as raízes como donos.
  let owners = tree.filter(n => layerKeyOf(n) === 'diretoria');
  if (!owners.length) owners = tree.slice();
  const ownerIds = new Set(owners.map(o => o.id));

  owners.forEach(owner => stack.appendChild(renderBlockHeader(owner, 80)));

  const conn = document.createElement('div');
  conn.className = 'connector-down';
  conn.style.height = '28px';
  stack.appendChild(conn);

  // 2) UM conjunto de bandas, agregando todos os demais nós por camada.
  //    Qualquer nó que não seja dono cai na faixa do seu nível (nunca gera
  //    estrutura duplicada, mesmo que tenha ficado sem pai).
  const pool = all.filter(n => !ownerIds.has(n.id));

  // Descendentes de departamentos renderizam aninhados dentro do container,
  // então não devem aparecer soltos em nenhuma outra faixa.
  const deptNodes = pool.filter(n => layerKeyOf(n) === 'departamento');
  const deptDescIds = new Set();
  deptNodes.forEach(d => collectDescendants(d).forEach(c => deptDescIds.add(c.id)));

  const bands = [];
  ORG_LAYERS.forEach(layer => {
    let members = pool.filter(n => layerKeyOf(n) === layer.key);
    if (layer.key !== 'departamento') members = members.filter(n => !deptDescIds.has(n.id));
    if (!layer.always && !members.length) return;
    bands.push({ layer, members });
  });
  bands.forEach((b, i) => {
    const bandEl = b.layer.key === 'departamento'
      ? renderDeptBand(b.layer, b.members)
      : renderLayerBand(b.layer, b.members);
    stack.appendChild(bandEl);
    if (i < bands.length - 1) {
      const c = document.createElement('div');
      c.className = 'connector-down';
      c.style.height = '24px';
      stack.appendChild(c);
    }
  });

  container.appendChild(stack);
}

// ============ MODAL NOVO DEPARTAMENTO ============
function openNewDeptModal() {
  const sel = document.getElementById('ndParent');
  sel.innerHTML = '<option value="">— Raiz (sem superior) —</option>';
  allNodes.forEach(n => {
    const opt = document.createElement('option');
    opt.value = n.id;
    opt.textContent = `${n.name} (${levelLabel(n.level)})`;
    sel.appendChild(opt);
  });
  // Auto-seleciona o primeiro nó de nível diretoria com parent
  const firstDir = allNodes.find(n => n.level === 'diretoria' && n.parent_id);
  if (firstDir) sel.value = firstDir.id;
  document.getElementById('ndName').value = '';
  document.getElementById('ndColor').value = '#3a86ff';
  document.getElementById('newDeptModalOverlay').classList.add('open');
}

function closeNewDeptModal() {
  document.getElementById('newDeptModalOverlay').classList.remove('open');
}

async function createDeptNode() {
  const name = document.getElementById('ndName').value.trim();
  const parentId = document.getElementById('ndParent').value || null;
  const color = document.getElementById('ndColor').value;
  if (!name) { document.getElementById('ndName').focus(); return; }

  await fetch('/api/nodes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, level: 'departamento', parent_id: parentId, color })
  });

  closeNewDeptModal();
  await loadOrg();
  if (viewMode !== 'blocks') setViewMode('blocks');
}

function renderDeptBlock(deptNode) {
  const color = deptNode.color || getAutoColor(deptNode);

  const block = document.createElement('div');
  block.className = 'dept-block';
  block.style.borderColor = color;

  const header = document.createElement('div');
  header.className = 'dept-block-header';
  header.style.background = color;
  header.onclick = () => openModal(deptNode.id);
  header.innerHTML = `
    <span class="dept-block-title">${deptNode.name}</span>
    ${deptNode.role ? `<span class="dept-block-subtitle">${deptNode.role}</span>` : ''}
    <button class="btn-edit-node" title="Editar" onclick="event.stopPropagation();editNodeById(${deptNode.id})">✏️</button>
  `;
  block.appendChild(header);

  const members = document.createElement('div');
  members.className = 'dept-members';

  if (deptNode.children?.length) {
    deptNode.children.forEach(child => members.appendChild(renderMemberBubble(child)));
  } else {
    members.innerHTML = '<div class="dept-empty">Nenhum membro cadastrado</div>';
  }

  block.appendChild(members);
  return block;
}

function renderMemberBubble(node) {
  const color = node.color || getAutoColor(node);
  const isSmall = ['gerencia', 'equipe', 'time', 'home', 'indireto'].includes(node.level);
  const sz = isSmall ? 64 : 80;
  const fs = isSmall ? 22 : 28;

  const wrap = document.createElement('div');
  wrap.className = 'member-bubble';
  wrap.dataset.id = node.id;
  wrap.onclick = () => openModal(node.id);

  const photoHtml = node.photo
    ? `<img src="${node.photo}" alt="${node.name}" loading="lazy">`
    : getInitials(node.name);

  wrap.innerHTML = `
    <div class="org-node level-${node.level}" style="position:relative">
      <div class="node-circle" style="width:${sz}px;height:${sz}px;font-size:${fs}px;border-color:${color}">
        ${photoHtml}
      </div>
      <div class="node-badge ${isSmall ? 'node-badge-sm' : ''}" style="background:${color};margin-top:-${isSmall ? 12 : 16}px;position:relative;z-index:2">
        <div class="node-name ${isSmall ? 'node-name-sm' : ''}">${node.name}</div>
        ${node.role ? `<div class="node-role ${isSmall ? 'node-role-sm' : ''}">${node.role}</div>` : ''}
      </div>
      <button class="btn-edit-node" title="Editar" onclick="event.stopPropagation();editNodeById(${node.id})">✏️</button>
      <button class="bubble-add bubble-add-side" title="Adicionar ao lado (mesmo nível)" onclick="event.stopPropagation();addSibling(${node.id})" style="top:${Math.round(sz / 2) - 11}px">+</button>
      <button class="bubble-add bubble-add-below" title="Adicionar abaixo (subordinado)" onclick="event.stopPropagation();openAddPanel(${node.id})">+</button>
    </div>
    ${node.children?.length ? `<div class="bubble-sub-count">+${node.children.length} subordinados</div>` : ''}
  `;

  return wrap;
}
