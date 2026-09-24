const express = require('express');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const path = require('path');
const { execFile, exec } = require('child_process');
const { promisify } = require('util');

const execFileP = promisify(execFile);
const execP = promisify(exec);

// ─── Auth ─────────────────────────────────────────────────────────────────────
const AUTH_SALT = 'jeff-alpha-2026';
const AUTH_HASH = 'cc189194985c4bac11329888a521216a265a8772db99d347512ebc2d9192bedb7c6b576d2dd3168f2b028b1d4fb36b7d1ea30c32515918f4c814bb03eabcca62';
const sessions = new Map();
// Senha redefinida pelo "Esqueci minha senha" fica em data/auth-override.json e vale no lugar do AUTH_HASH.
const pwdReset = require('/opt/jeff-apps/jeff-shared/password-reset');
const pwdOverride = pwdReset.overrideStore(require('path').join(__dirname, 'data'));
function verifyPwd(pwd) {
  const viaOverride = pwdOverride.check(pwd);
  if (viaOverride !== null) return viaOverride;
  try {
    const test = crypto.scryptSync(pwd, AUTH_SALT, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(AUTH_HASH, 'hex'));
  } catch { return false; }
}
function newSession() {
  const tok = crypto.randomBytes(32).toString('hex');
  sessions.set(tok, Date.now() + 30 * 24 * 60 * 60 * 1000);
  return tok;
}
function parseCookies(req) {
  const list = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) list[k.trim()] = decodeURIComponent(v.join('='));
  });
  return list;
}
function getSession(req) {
  const exp = sessions.get(parseCookies(req).sid);
  return exp && exp > Date.now();
}
function requireAuth(req, res, next) {
  if (!getSession(req)) return res.redirect('/login');
  next();
}
function apiAuth(req, res, next) {
  if (!getSession(req)) return res.status(401).json({ error: 'unauthorized' });
  next();
}
// ─────────────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(express.static(__dirname + '/public', { index: false }));


pwdReset.mount(app, {
  appName: 'VPS Monitor',
  setPassword: (newPass) => { pwdOverride.write(newPass); sessions.clear(); return true; }
});

app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.post('/api/login', express.urlencoded({ extended: false }), (req, res) => {
  if (!verifyPwd(req.body.password || '')) return res.redirect('/login?error=1');
  const tok = newSession();
  res.set('Set-Cookie', `sid=${tok}; HttpOnly; Path=/; Max-Age=${30 * 24 * 3600}`);
  res.redirect('/');
});
app.get('/api/logout', (req, res) => {
  const c = parseCookies(req);
  if (c.sid) sessions.delete(c.sid);
  res.set('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
  res.redirect('/login');
});
app.get('/', requireAuth, (_req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

const PORT = process.env.PORT || 3012;

// helpers
const sh = async (cmd) => {
  try {
    const { stdout } = await execP(cmd, { timeout: 8000, maxBuffer: 4 * 1024 * 1024 });
    return stdout.trim();
  } catch (e) {
    return null;
  }
};

const readProc = (path) => {
  try { return fs.readFileSync(path, 'utf8'); } catch { return null; }
};

// ---- Metric collectors ----
function getCpuTimes() {
  const lines = readProc('/proc/stat')?.split('\n') || [];
  const cpu = lines.find(l => l.startsWith('cpu '));
  if (!cpu) return null;
  const parts = cpu.trim().split(/\s+/).slice(1).map(Number);
  const [user, nice, system, idle, iowait, irq, softirq, steal] = parts;
  const total = parts.reduce((a, b) => a + b, 0);
  const idleTotal = idle + (iowait || 0);
  return { total, idle: idleTotal };
}

let lastCpu = null;
function getCpuPercent() {
  const cur = getCpuTimes();
  if (!cur) return 0;
  if (!lastCpu) { lastCpu = cur; return 0; }
  const totalDiff = cur.total - lastCpu.total;
  const idleDiff = cur.idle - lastCpu.idle;
  lastCpu = cur;
  if (totalDiff <= 0) return 0;
  return +(100 * (1 - idleDiff / totalDiff)).toFixed(1);
}
// prime the lastCpu
getCpuPercent();

function getMemory() {
  const total = os.totalmem();
  const free = os.freemem();
  const memInfo = readProc('/proc/meminfo') || '';
  const m = (k) => {
    const r = new RegExp(`^${k}:\\s+(\\d+)`, 'm').exec(memInfo);
    return r ? parseInt(r[1], 10) * 1024 : 0;
  };
  const available = m('MemAvailable') || free;
  const buffers = m('Buffers');
  const cached = m('Cached');
  const used = total - available;
  return {
    total, used, free, available, buffers, cached,
    percent: +(100 * used / total).toFixed(1),
  };
}

function getSwap() {
  const memInfo = readProc('/proc/meminfo') || '';
  const m = (k) => {
    const r = new RegExp(`^${k}:\\s+(\\d+)`, 'm').exec(memInfo);
    return r ? parseInt(r[1], 10) * 1024 : 0;
  };
  const total = m('SwapTotal');
  const free = m('SwapFree');
  const used = total - free;
  return {
    total, used, free,
    percent: total > 0 ? +(100 * used / total).toFixed(1) : 0,
  };
}

function getLoad() {
  const load = os.loadavg();
  const cores = os.cpus().length;
  return {
    cores,
    load1: +load[0].toFixed(2),
    load5: +load[1].toFixed(2),
    load15: +load[2].toFixed(2),
    percent1: +(100 * load[0] / cores).toFixed(1),
  };
}

async function getDisks() {
  const out = await sh("df -PB1 -x tmpfs -x devtmpfs -x squashfs -x overlay 2>/dev/null | tail -n +2");
  if (!out) return [];
  return out.split('\n').map(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) return null;
    const [fs, total, used, avail, pctRaw, mount] = [parts[0], +parts[1], +parts[2], +parts[3], parts[4], parts.slice(5).join(' ')];
    return {
      fs, mount,
      total, used, avail,
      percent: +parseFloat(pctRaw).toFixed(1),
    };
  }).filter(Boolean);
}

let lastNet = null;
let lastNetTs = 0;
async function getNetwork() {
  const data = readProc('/proc/net/dev') || '';
  const lines = data.split('\n').slice(2);
  const ifaces = {};
  let totalRx = 0, totalTx = 0;
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 17) continue;
    const name = parts[0].replace(':', '');
    if (name === 'lo' || name.startsWith('veth') || name.startsWith('br-')) continue;
    const rx = +parts[1];
    const tx = +parts[9];
    ifaces[name] = { rx, tx };
    totalRx += rx;
    totalTx += tx;
  }
  const now = Date.now();
  let rxRate = 0, txRate = 0;
  if (lastNet && (now - lastNetTs) > 0) {
    const dt = (now - lastNetTs) / 1000;
    rxRate = Math.max(0, (totalRx - lastNet.rx) / dt);
    txRate = Math.max(0, (totalTx - lastNet.tx) / dt);
  }
  lastNet = { rx: totalRx, tx: totalTx };
  lastNetTs = now;
  return { ifaces, totalRx, totalTx, rxRate, txRate };
}
getNetwork();

async function getTopProcesses() {
  const out = await sh("ps -eo pid,pcpu,pmem,rss,user,comm --sort=-pcpu --no-headers | head -10");
  if (!out) return [];
  return out.split('\n').map(line => {
    const p = line.trim().split(/\s+/);
    return {
      pid: +p[0],
      cpu: +p[1],
      mem: +p[2],
      rss: +p[3] * 1024,
      user: p[4],
      cmd: p.slice(5).join(' '),
    };
  });
}

async function getPm2() {
  const out = await sh("pm2 jlist 2>/dev/null");
  if (!out) return [];
  try {
    const arr = JSON.parse(out);
    return arr.map(p => ({
      name: p.name,
      pid: p.pid,
      status: p.pm2_env?.status,
      restarts: p.pm2_env?.restart_time,
      uptime: p.pm2_env?.pm_uptime ? Date.now() - p.pm2_env.pm_uptime : 0,
      cpu: p.monit?.cpu || 0,
      memory: p.monit?.memory || 0,
    }));
  } catch { return []; }
}

async function getDocker() {
  const out = await sh("docker ps --format '{{.Names}}|{{.Status}}|{{.Image}}' 2>/dev/null");
  if (!out) return [];
  return out.split('\n').map(l => {
    const [name, status, image] = l.split('|');
    return { name, status, image, healthy: /Up/i.test(status) && !/unhealthy/i.test(status) };
  });
}

async function getUptime() {
  const upSec = os.uptime();
  return { seconds: Math.floor(upSec) };
}

async function getDistro() {
  const data = readProc('/etc/os-release') || '';
  const m = /PRETTY_NAME="([^"]+)"/.exec(data);
  return m ? m[1] : 'Linux';
}

async function getKernel() { return os.release(); }
async function getHostname() { return os.hostname(); }

async function getInfo() {
  return {
    hostname: await getHostname(),
    distro: await getDistro(),
    kernel: await getKernel(),
    arch: os.arch(),
    cpu_model: os.cpus()[0]?.model || 'unknown',
    cpu_cores: os.cpus().length,
  };
}

async function snapshot() {
  const [disks, network, top, pm2, docker, info, uptime] = await Promise.all([
    getDisks(),
    getNetwork(),
    getTopProcesses(),
    getPm2(),
    getDocker(),
    getInfo(),
    getUptime(),
  ]);
  return {
    timestamp: new Date().toISOString(),
    info,
    uptime,
    cpu: { percent: getCpuPercent(), ...getLoad() },
    memory: getMemory(),
    swap: getSwap(),
    disks,
    network,
    top_processes: top,
    pm2, docker,
  };
}

// ---- Status semáforo logic ----
function statusFor(metric, value) {
  // returns { color, label }
  const rules = {
    cpu:    [[70, 'green'], [85, 'yellow'], [101, 'red']],
    load:   [[70, 'green'], [100, 'yellow'], [9999, 'red']],
    memory: [[70, 'green'], [85, 'yellow'], [101, 'red']],
    swap:   [[10, 'green'], [40, 'yellow'], [101, 'red']],
    disk:   [[70, 'green'], [85, 'yellow'], [101, 'red']],
  };
  const r = rules[metric];
  if (!r) return { color: 'green' };
  for (const [t, c] of r) if (value <= t) return { color: c };
  return { color: 'red' };
}

function evaluateSnapshot(snap) {
  const items = [];
  items.push({ key: 'CPU', value: `${snap.cpu.percent}%`, ...statusFor('cpu', snap.cpu.percent) });
  items.push({ key: 'Load 1m', value: `${snap.cpu.load1} (${snap.cpu.percent1}%)`, ...statusFor('load', snap.cpu.percent1) });
  items.push({ key: 'RAM', value: `${snap.memory.percent}%`, ...statusFor('memory', snap.memory.percent) });
  items.push({ key: 'Swap', value: snap.swap.total > 0 ? `${snap.swap.percent}%` : 'desativado', ...statusFor('swap', snap.swap.percent) });
  for (const d of snap.disks) {
    items.push({ key: `Disco ${d.mount}`, value: `${d.percent}%`, ...statusFor('disk', d.percent) });
  }
  // PM2 processes erroneous
  const pm2bad = (snap.pm2 || []).filter(p => p.status && p.status !== 'online');
  if (pm2bad.length) {
    items.push({ key: 'PM2', value: `${pm2bad.length} processo(s) fora do ar: ${pm2bad.map(p => p.name).join(', ')}`, color: 'red' });
  } else {
    items.push({ key: 'PM2', value: `${(snap.pm2 || []).length} online`, color: 'green' });
  }
  // Docker
  const dockerBad = (snap.docker || []).filter(c => !c.healthy);
  if (snap.docker && snap.docker.length) {
    items.push({
      key: 'Docker',
      value: dockerBad.length ? `${dockerBad.length} com problema` : `${snap.docker.length} containers ok`,
      color: dockerBad.length ? 'red' : 'green',
    });
  }
  return items;
}

// ---- VPS upgrade tiers (Contabo defaults) ----
const VPS_TIERS = [
  { name: 'VPS S',   cores: 4,  ram_gb: 8,   disk_gb: 100,  price_brl: 32,  bandwidth: '32 TB' },
  { name: 'VPS M',   cores: 6,  ram_gb: 16,  disk_gb: 200,  price_brl: 50,  bandwidth: '32 TB' },
  { name: 'VPS L',   cores: 8,  ram_gb: 30,  disk_gb: 400,  price_brl: 78,  bandwidth: '32 TB' },
  { name: 'VPS XL',  cores: 10, ram_gb: 60,  disk_gb: 800,  price_brl: 130, bandwidth: '32 TB' },
  { name: 'VPS Cloud L', cores: 12, ram_gb: 48, disk_gb: 800,  price_brl: 235, bandwidth: '32 TB' },
];

function recommendTier(snap) {
  const ramGb = snap.memory.total / (1024 ** 3);
  const cores = snap.cpu.cores;
  const diskTotalGb = snap.disks.reduce((a, d) => a + d.total, 0) / (1024 ** 3);
  // Find current
  const current = VPS_TIERS.reduce((best, t) => {
    const score = (Math.abs(t.cores - cores) + Math.abs(t.ram_gb - ramGb));
    return (!best || score < best.score) ? { ...t, score } : best;
  }, null);

  // pressure heuristics
  const cpuTight = snap.cpu.percent > 70 || snap.cpu.percent1 > 90;
  const ramTight = snap.memory.percent > 75;
  const diskTight = snap.disks.some(d => d.percent > 80);
  const swapHot = snap.swap.total > 0 && snap.swap.percent > 30;

  const need = cpuTight || ramTight || diskTight || swapHot;
  const currentIdx = VPS_TIERS.findIndex(t => t.name === current?.name);
  const next = currentIdx >= 0 && currentIdx < VPS_TIERS.length - 1 ? VPS_TIERS[currentIdx + 1] : null;
  const nextNext = currentIdx >= 0 && currentIdx < VPS_TIERS.length - 2 ? VPS_TIERS[currentIdx + 2] : null;

  return {
    detected_specs: {
      cores,
      ram_gb: +ramGb.toFixed(1),
      disk_gb: +diskTotalGb.toFixed(0),
    },
    current_tier_match: current ? { name: current.name, cores: current.cores, ram_gb: current.ram_gb, disk_gb: current.disk_gb } : null,
    upgrade_recommended: need,
    pressure: { cpuTight, ramTight, diskTight, swapHot },
    options: [next, nextNext].filter(Boolean).map(t => ({
      ...t,
      delta_cores: t.cores - cores,
      delta_ram_gb: +(t.ram_gb - ramGb).toFixed(1),
      delta_disk_gb: +(t.disk_gb - diskTotalGb).toFixed(0),
      benefits: buildBenefits(t, cores, ramGb, diskTotalGb),
    })),
  };
}

function buildBenefits(tier, cores, ramGb, diskGb) {
  const out = [];
  const dc = tier.cores - cores;
  const dr = tier.ram_gb - ramGb;
  const dd = tier.disk_gb - diskGb;
  if (dc > 0) out.push(`+${dc} vCores: roda ${Math.round(100 * dc / Math.max(cores, 1))}% a mais de processos pesados em paralelo (workers PM2, builds, transcrição Whisper, automações Claude).`);
  if (dr > 1) out.push(`+${dr.toFixed(0)} GB RAM: cabe mais agentes simultâneos, cache do SQLite maior, sem risco de OOM no whatsapp-worker em pico.`);
  if (dd > 10) out.push(`+${dd.toFixed(0)} GB disco: armazena mais mídias do WhatsApp, banco de mensagens, logs PM2 e backups sem precisar limpar.`);
  if (out.length === 0) out.push('Mesma capacidade nominal; troca só se quiser SLA premium.');
  return out;
}

function buildAdvice(snap, items) {
  const advice = [];
  const reds = items.filter(i => i.color === 'red');
  const yellows = items.filter(i => i.color === 'yellow');

  if (snap.cpu.percent > 85) advice.push({ severity: 'red', text: `CPU em ${snap.cpu.percent}%. Identifica o processo dominante na lista de Top processos e considera mover/escalar.` });
  else if (snap.cpu.percent > 70) advice.push({ severity: 'yellow', text: `CPU em ${snap.cpu.percent}%. Monitora; se sustentar, suba pro próximo tier.` });

  if (snap.cpu.percent1 > 100) advice.push({ severity: 'red', text: `Load 1m acima de 100% por core (${snap.cpu.load1}). Sistema está enfileirando trabalho.` });

  if (snap.memory.percent > 85) advice.push({ severity: 'red', text: `RAM em ${snap.memory.percent}%. Risco de OOM. Reduz cache, mata processos zumbi ou faz upgrade.` });
  else if (snap.memory.percent > 70) advice.push({ severity: 'yellow', text: `RAM em ${snap.memory.percent}%. Margem apertando.` });

  if (snap.swap.total > 0 && snap.swap.percent > 40) advice.push({ severity: 'red', text: `Swap em ${snap.swap.percent}%. Performance degradada por I/O em disco.` });
  else if (snap.swap.total === 0 && snap.memory.percent > 75) advice.push({ severity: 'yellow', text: 'Sem swap configurado e RAM apertando. Considera ativar 2 a 4 GB de swap como rede de segurança.' });

  for (const d of snap.disks) {
    if (d.percent > 90) advice.push({ severity: 'red', text: `Disco ${d.mount} em ${d.percent}%. Limpa logs/mídia antiga ou aumenta o volume.` });
    else if (d.percent > 80) advice.push({ severity: 'yellow', text: `Disco ${d.mount} em ${d.percent}%. Planeja limpeza ou expansão.` });
  }

  const pm2bad = (snap.pm2 || []).filter(p => p.status && p.status !== 'online');
  for (const p of pm2bad) advice.push({ severity: 'red', text: `PM2 ${p.name} está ${p.status}. Investiga via pm2 logs ${p.name}.` });

  const pm2HighRestart = (snap.pm2 || []).filter(p => p.restarts > 50);
  for (const p of pm2HighRestart) advice.push({ severity: 'yellow', text: `PM2 ${p.name} reiniciou ${p.restarts}x. Pode estar instável.` });

  if (advice.length === 0) advice.push({ severity: 'green', text: 'Sistema saudável. Nenhuma ação necessária no momento.' });
  return advice;
}

// ---- Routes ----
app.get('/api/metrics', apiAuth, async (req, res) => {
  try {
    const snap = await snapshot();
    const status_items = evaluateSnapshot(snap);
    const overall = status_items.some(i => i.color === 'red') ? 'red'
                  : status_items.some(i => i.color === 'yellow') ? 'yellow' : 'green';
    res.json({ ...snap, status_items, overall });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/analyze', apiAuth, async (req, res) => {
  try {
    // take 2 snapshots 1.5s apart for accurate CPU
    await snapshot();
    await new Promise(r => setTimeout(r, 1500));
    const snap = await snapshot();
    const status_items = evaluateSnapshot(snap);
    const overall = status_items.some(i => i.color === 'red') ? 'red'
                  : status_items.some(i => i.color === 'yellow') ? 'yellow' : 'green';
    const advice = buildAdvice(snap, status_items);
    const upgrade = recommendTier(snap);
    res.json({ snapshot: snap, status_items, overall, advice, upgrade });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[jeff-vps-monitor] listening on 0.0.0.0:${PORT}`);
});
