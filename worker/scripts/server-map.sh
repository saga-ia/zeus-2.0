#!/bin/bash
# Mapa do servidor (Zeus). SÓ LEITURA. Gera:
#   /opt/jeff-worker/docs/mapa-servidor.md   (pra ler/perguntar)
#   /opt/jeff-worker/data/mapa-servidor.json (pra script)
# Junta: PM2 (apps, status, reinícios), portas abertas, proxy do NPM (domínio → destino),
# sites estáticos, Docker, crons, integrações (só NOMES de chave do app_settings) e alertas.
# Nunca grava valor de segredo: no máximo o nome da variável.
# Uso: server-map.sh            (cron diário; leva ~10 s)
set -u
export PATH=/root/.nvm/versions/node/v20.20.2/bin:$PATH
W=/opt/jeff-worker
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
pm2 jlist > "$TMP/pm2.json" 2>/dev/null || echo '[]' > "$TMP/pm2.json"
ss -ltnpH > "$TMP/ss.txt" 2>/dev/null
"$W/scripts/npm.sh" hosts > "$TMP/npm.txt" 2>/dev/null
docker ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}' > "$TMP/docker.txt" 2>/dev/null
crontab -l > "$TMP/cron.txt" 2>/dev/null

python3 - "$TMP" <<'PY'
import json, os, re, sys, glob, sqlite3, time
from datetime import datetime, timedelta, timezone
T = sys.argv[1]; W = "/opt/jeff-worker"
BRT = timezone(timedelta(hours=-3)); agora = datetime.now(BRT)
def rd(p, d=""):
    try: return open(p, encoding="utf-8", errors="replace").read()
    except Exception: return d

# --- portas abertas: porta -> pid -> pasta (cwd)
portas = {}
for l in rd(f"{T}/ss.txt").splitlines():
    m = re.search(r"\s(\S+):(\d+)\s.*pid=(\d+)", l)
    if not m: continue
    host, port, pid = m.group(1), int(m.group(2)), int(m.group(3))
    try: cwd = os.readlink(f"/proc/{pid}/cwd")
    except Exception: cwd = ""
    portas.setdefault(port, {"host": host, "pid": pid, "cwd": cwd})

# --- PM2
apps = {}
for a in json.loads(rd(f"{T}/pm2.json", "[]") or "[]"):
    env = a.get("pm2_env", {})
    cwd = env.get("pm_cwd") or os.path.dirname(env.get("pm_exec_path", ""))
    mins = int((time.time() * 1000 - env.get("pm_uptime", 0)) / 60000) if env.get("status") == "online" else None
    apps[a["name"]] = {"nome": a["name"], "status": env.get("status"), "reinicios": env.get("restart_time", 0),
                       "uptime_min": mins, "pasta": cwd, "script": env.get("pm_exec_path"),
                       "memoria_mb": round((a.get("monit") or {}).get("memory", 0) / 1048576), "portas": [], "dominios": [],
                       "pid": a.get("pid"), "porta_env": str((env.get("env") or {}).get("PORT") or env.get("PORT") or ""), "modo": env.get("exec_mode")}
def ancestrais(pid):
    out = []
    for _ in range(6):
        try: pid = int(rd(f"/proc/{pid}/stat").split(") ")[1].split()[1])
        except Exception: break
        if pid <= 1: break
        out.append(pid)
    return out
for port, p in portas.items():
    online = [ap for ap in apps.values() if ap["status"] == "online"]
    anc = ancestrais(p["pid"])
    regras = [lambda ap: ap["pid"] and (p["pid"] == ap["pid"] or ap["pid"] in anc),
              lambda ap: p["cwd"] not in ("", "/") and ap["pasta"] and (p["cwd"] == ap["pasta"] or p["cwd"].startswith(ap["pasta"] + "/")),
              lambda ap: str(port) == ap["porta_env"]]
    for regra in regras:
        dono = next((ap for ap in online if regra(ap)), None)
        if dono: dono["portas"].append(port); p["app"] = dono["nome"]; break

# --- NPM proxy hosts
raw = rd(f"{T}/npm.txt"); hosts = []
if "[" in raw:
    try: hosts = json.JSONDecoder().raw_decode(raw[raw.index("["):])[0]
    except Exception: hosts = []
dominios = []
for h in hosts:
    fh, fp = h.get("forward_host"), h.get("forward_port")
    alvo = None
    if fh == "jeff-sites-nginx":
        sub = h["domain_names"][0].split(".")[0]
        mapa = {"bio": "farias-souza"}
        alvo = f"site:/opt/jeff-sites/{mapa.get(sub, sub)}"
    elif any((fh or "") in c.split("|")[0] and f"{fp}/tcp" in c for c in rd(f"{T}/docker.txt").splitlines()): alvo = f"docker {fh}:{fp}"
    elif fp in portas: alvo = f"porta {fp} ({portas[fp].get('app') or os.path.basename(portas[fp]['cwd']) or 'pid ' + str(portas[fp]['pid'])})"
    else: alvo = f"porta {fp} (NADA ESCUTANDO)"
    for dn in h.get("domain_names", []):
        dominios.append({"dominio": dn, "destino": f"{fh}:{fp}", "alvo": alvo, "ativo": h.get("enabled"), "online": (h.get("meta") or {}).get("nginx_online")})
        if fp in portas and portas[fp].get("app"): apps[portas[fp]["app"]]["dominios"].append(dn)

# --- descrição de cada app (package.json description, comentário do topo ou title)
def descr(pasta):
    pj = rd(f"{pasta}/package.json")
    try:
        d = json.loads(pj).get("description")
        if d: return d[:140]
    except Exception: pass
    for f in ("server.js", "index.js", "app.js", "server.mjs"):
        t = rd(f"{pasta}/{f}")[:1500]
        m = re.search(r"^\s*(?://|\*|#)\s*(.{15,140})", t, re.M)
        if m: return m.group(1).strip(" */")
    t = rd(f"{pasta}/public/index.html")[:3000]
    m = re.search(r"<title>([^<]{3,120})</title>", t)
    return m.group(1) if m else ""
def bancos(pasta):
    out = []
    for f in glob.glob(f"{pasta}/*.db") + glob.glob(f"{pasta}/data/*.db"):
        s = os.path.getsize(f)
        if s > 0: out.append(f"{f.replace(pasta + '/', '')} ({round(s / 1024)} KB)")
    return out
def segredos_no_codigo(pasta):
    nomes = set()
    for f in ("ecosystem.config.js", "ecosystem.config.cjs", "server.js", "config.js"):
        for m in re.finditer(r"\b([A-Z][A-Z0-9_]*(?:PASS(?:WORD)?|SECRET|TOKEN|API_KEY|KEY))\s*[:=]\s*['\"][^'\"]{6,}['\"]", rd(f"{pasta}/{f}")):
            nomes.add(f"{m.group(1)} em {f}")
    return sorted(nomes)

pastas_apps = sorted(d for d in glob.glob("/opt/jeff-apps/*") if os.path.isdir(d))
inventario = []
for pasta in pastas_apps:
    ap = next((a for a in apps.values() if a["pasta"] == pasta or (a["pasta"] or "").startswith(pasta + "/")), None)
    inventario.append({"pasta": pasta, "app_pm2": ap["nome"] if ap else None, "descricao": descr(pasta), "bancos": bancos(pasta),
                       "segredos_no_codigo": segredos_no_codigo(pasta), "docker": os.path.exists(f"{pasta}/docker-compose.yml") or os.path.exists(f"{pasta}/compose.yml")})
for ap in apps.values():  # apps do PM2 fora de /opt/jeff-apps
    if not any(i["app_pm2"] == ap["nome"] for i in inventario):
        inventario.append({"pasta": ap["pasta"], "app_pm2": ap["nome"], "descricao": descr(ap["pasta"]) if os.path.isdir(ap["pasta"] or "") else "", "bancos": bancos(ap["pasta"]) if ap["pasta"] else [], "segredos_no_codigo": [], "docker": False})

# --- sites estáticos
dom_por_site = {}
for d in dominios:
    if d["alvo"].startswith("site:"): dom_por_site.setdefault(d["alvo"][5:], []).append(d["dominio"])
sites = []
for s in sorted(glob.glob("/opt/jeff-sites/*")):
    if not os.path.isdir(s) or os.path.basename(s).startswith("_"): continue
    idx = f"{s}/index.html"
    t = rd(idx)[:4000]; m = re.search(r"<title>([^<]{2,120})</title>", t)
    sites.append({"pasta": s, "titulo": m.group(1).strip() if m else "", "dominios": dom_por_site.get(s, []),
                  "atualizado": datetime.fromtimestamp(os.path.getmtime(idx if os.path.exists(idx) else s), BRT).strftime("%d/%m/%Y") })

# --- docker, cron, integrações
docker = [dict(zip(["nome", "imagem", "status", "portas"], l.split("|"))) for l in rd(f"{T}/docker.txt").splitlines() if l.strip()]
crons = [l for l in rd(f"{T}/cron.txt").splitlines() if l.strip() and not l.startswith("#")]
integ = {}
try:
    db = sqlite3.connect(f"file:{W}/data/worker.db?mode=ro", uri=True)
    for (k,) in db.execute("SELECT key FROM app_settings ORDER BY key"):
        grupo = re.split(r"[_.]", k.replace("jeff_", ""))[0]
        integ.setdefault(grupo, []).append(k)
except Exception as e: integ = {"erro": [str(e)]}

# --- alertas
SOB_DEMANDA = {"jeff-creator-lab"}  # sobe só quando usado (scripts/creator-lab.sh)
alertas = []
for ap in apps.values():
    if ap["status"] != "online": alertas.append(f"PM2 `{ap['nome']}` está **{ap['status']}**")
    elif ap["reinicios"] >= 10: alertas.append(f"PM2 `{ap['nome']}` reiniciou **{ap['reinicios']}x** (online há {ap['uptime_min']} min)")
for d in dominios:
    if "NADA ESCUTANDO" in d["alvo"]: alertas.append(f"domínio `{d['dominio']}` aponta pra {d['destino']} e **nada responde** nessa porta")
    if d["alvo"].startswith("site:") and not os.path.isdir(d["alvo"][5:]): alertas.append(f"domínio `{d['dominio']}` aponta pra site sem pasta ({d['alvo'][5:]})")
for i in inventario:
    if os.path.basename(i["pasta"]) in SOB_DEMANDA: continue
    if not i["app_pm2"] and not i["docker"] and i["pasta"].startswith("/opt/jeff-apps"): alertas.append(f"pasta `{i['pasta']}` não roda no PM2 (parada, antiga ou Docker?)")
    for s in i["segredos_no_codigo"]: alertas.append(f"segredo escrito no código: `{s}` ({os.path.basename(i['pasta'])})")
for f in glob.glob("/opt/jeff-sites/*/.env*") + glob.glob("/opt/jeff-sites/*/*.db") + glob.glob("/opt/jeff-sites/*/*.log") + glob.glob("/opt/jeff-sites/*/node_modules"):
    alertas.append(f"arquivo sensível na pasta pública de site: `{f}`")
for p, info in portas.items():
    pass
for p, info in portas.items():
    if info["host"] in ("0.0.0.0", "*", "[::]") and p not in (22, 80, 81, 443):
        alertas.insert(0, f"GRAVE: porta {p} escuta em todas as interfaces e não há firewall no servidor: `{info.get('app') or info['cwd']}` abre direto em http://IP:{p} sem HTTPS e sem passar pelo proxy")

res = {"gerado_em": agora.strftime("%d/%m/%Y %H:%M BRT"), "apps_pm2": list(apps.values()), "inventario_apps": inventario, "dominios": dominios,
       "sites": sites, "docker": docker, "crons": crons, "integracoes": integ, "portas": {str(k): v for k, v in sorted(portas.items())}, "alertas": alertas}
json.dump(res, open(f"{W}/data/mapa-servidor.json", "w"), ensure_ascii=False, indent=1)

# --- markdown
L = [f"# Mapa do servidor", "", f"Gerado automaticamente em {res['gerado_em']} por `scripts/server-map.sh` (só leitura, sem valores de segredo). Não editar à mão: rodar o script de novo.", ""]
on = sum(1 for a in apps.values() if a["status"] == "online")
L += [f"**Resumo:** {len(apps)} apps no PM2 ({on} online) | {len(inventario)} pastas de app | {len(sites)} sites estáticos | {len(dominios)} domínios no proxy | {len(docker)} containers | {len(crons)} crons | {len(alertas)} alertas", ""]
L += ["## Alertas", ""] + ([f"- {a}" for a in alertas] or ["- nenhum"]) + [""]
L += ["## Apps (PM2)", "", "| App | Status | Reinícios | Porta | Domínio | Pasta | O que é | Banco |", "|---|---|---|---|---|---|---|---|"]
for ap in sorted(apps.values(), key=lambda a: a["nome"]):
    inv = next((i for i in inventario if i["app_pm2"] == ap["nome"]), {})
    L.append(f"| {ap['nome']} | {ap['status']} | {ap['reinicios']} | {', '.join(map(str, sorted(set(ap['portas'])))) or '-'} | {', '.join(sorted(set(ap['dominios']))) or '-'} | `{ap['pasta']}` | {(inv.get('descricao') or '').replace('|', '/')} | {', '.join(inv.get('bancos') or []) or '-'} |")
L += ["", "## Pastas de app fora do PM2", ""]
L += [f"- `{i['pasta']}`{' (docker)' if i['docker'] else ''}: {i['descricao'] or 'sem descrição'}" for i in inventario if not i["app_pm2"]] or ["- nenhuma"]
L += ["", "## Domínios (Nginx Proxy Manager)", "", "| Domínio | Vai pra | Ativo |", "|---|---|---|"]
L += [f"| {d['dominio']} | {d['alvo']} | {'sim' if d['ativo'] else 'não'} |" for d in sorted(dominios, key=lambda x: x["dominio"].split(".", 1)[-1] + x["dominio"])]
L += ["", "## Sites estáticos (/opt/jeff-sites)", "", "| Pasta | Título | Domínios | Atualizado |", "|---|---|---|---|"]
L += [f"| `{os.path.basename(s['pasta'])}` | {s['titulo'].replace('|', '/')} | {', '.join(s['dominios']) or 'sem domínio'} | {s['atualizado']} |" for s in sites]
L += ["", "## Docker", ""] + [f"- `{c['nome']}` ({c['imagem']}): {c['status']} | {c['portas'] or '-'}" for c in docker]
L += ["", "## Crons (horário do servidor: Europe/Berlin)", ""] + [f"- `{c}`" for c in crons]
L += ["", "## Integrações (nomes de chave no app_settings, sem valores)", ""] + [f"- **{g}**: {', '.join(ks)}" for g, ks in sorted(integ.items())]
L += ["", "## Portas abertas", "", "| Porta | Escuta em | App/pasta |", "|---|---|---|"]
L += [f"| {p} | {i['host']} | {i.get('app') or i['cwd'] or i['pid']} |" for p, i in sorted(portas.items())]
open(f"{W}/docs/mapa-servidor.md", "w").write("\n".join(L) + "\n")
print(f"mapa: {W}/docs/mapa-servidor.md | {len(apps)} apps, {len(dominios)} domínios, {len(sites)} sites, {len(alertas)} alertas")
PY
