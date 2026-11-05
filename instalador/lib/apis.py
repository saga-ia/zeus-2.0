#!/usr/bin/env python3
"""Liga as APIs do cliente ao domínio novo, com as chaves dele (roda depois do SSL).

Automático, quando a chave existe: webhook do Instagram (app da Meta + conta), ID da conta do Instagram,
webhook do Asaas, webhook do ClickUp. O que não tem API pra configurar (Google, ZapSign, domínios do app
da Meta) sai numa lista com as URLs exatas pra colar no painel.

Uso: python3 -I apis.py <respostas.json>
"""
import json, os, sqlite3, sys, urllib.error, urllib.parse, urllib.request

R = json.load(open(sys.argv[1]))
OPT = R.get('raiz_opt', '/opt')
DOM = R['dominio']
GV = 'v21.0'
con = sqlite3.connect(os.path.join(OPT, 'jeff-worker', 'data', 'worker.db'))

def s(k):
    r = con.execute('SELECT value FROM app_settings WHERE key=?', (k,)).fetchone()
    return r[0] if r and r[0] else ''
def grava(k, v):
    con.execute("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at", (k, str(v)))
    con.commit()

def http(metodo, url, corpo=None, cab=None, form=False):
    dados = None
    if corpo is not None:
        dados = urllib.parse.urlencode(corpo).encode() if form else json.dumps(corpo).encode()
    r = urllib.request.Request(url, data=dados, method=metodo, headers=cab or {})
    if corpo is not None and not form:
        r.add_header('Content-Type', 'application/json')
    r.add_header('User-Agent', 'zeus-instalador')
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            t = resp.read().decode()
            try: return json.loads(t)
            except ValueError: return t
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'HTTP {e.code}: {e.read().decode()[:200]}')

feito, falhou, manual = [], [], []
def tenta(nome, fn):
    try:
        r = fn()
        if r is not None:
            feito.append(f'{nome}: {r}')
    except Exception as e:
        falhou.append(f'{nome}: {e}')

# ---------- Instagram ----------
ig_token = s('jeff_instagram_login_token')
cb_ig = f'https://instagram.{DOM}/webhook'
verify = s('jeff_meta_ig_webhook_verify_token')

def ig_conta():
    d = http('GET', f'https://graph.instagram.com/{GV}/me?fields=user_id,username&access_token={urllib.parse.quote(ig_token)}')
    grava('jeff_meta_ig_account_id', d.get('user_id') or d.get('id'))
    return f"@{d.get('username')} (id {d.get('user_id') or d.get('id')})"

def ig_callback_ok():
    t = http('GET', cb_ig + '?' + urllib.parse.urlencode({'hub.mode': 'subscribe', 'hub.verify_token': verify, 'hub.challenge': 'zeus-ok'}))
    if str(t).strip() != 'zeus-ok':
        raise RuntimeError(f'{cb_ig} não respondeu o desafio (SSL ou app fora do ar?)')

def ig_webhook_app():
    ig_callback_ok()
    erros = []
    for app_id, sec in [(s('jeff_meta_app_id_ig'), s('jeff_meta_app_secret_ig')), (s('jeff_meta_app_id_zeus'), s('jeff_meta_app_secret_zeus'))]:
        if not (app_id and sec):
            continue
        try:
            http('POST', f'https://graph.facebook.com/{GV}/{app_id}/subscriptions', {
                'object': 'instagram', 'callback_url': cb_ig, 'verify_token': verify,
                'fields': 'messages,comments,mentions,messaging_postbacks', 'access_token': f'{app_id}|{sec}'}, form=True)
            return f'assinado no app {app_id} -> {cb_ig}'
        except Exception as e:
            erros.append(f'app {app_id}: {e}')
    raise RuntimeError('; '.join(erros) or 'sem App ID/Secret')

def ig_conta_assina():
    http('POST', f'https://graph.instagram.com/{GV}/me/subscribed_apps?subscribed_fields=messages,comments&access_token={urllib.parse.quote(ig_token)}', {}, form=True)
    return 'conta recebendo mensagens e comentários'

if ig_token:
    tenta('Instagram, conta', ig_conta)
    tenta('Instagram, webhook do app', ig_webhook_app)
    tenta('Instagram, assinatura da conta', ig_conta_assina)
manual.append(f'Meta (developers.facebook.com > app do cliente): Domínios do app = {DOM} ; '
              f'URI de redirecionamento OAuth = https://myig.{DOM}/oauth/callback ; '
              f'Webhook do Instagram (se não ficou automático) = {cb_ig} com token de verificação = {verify}')

# ---------- Asaas ----------
asaas = s('asaas_api_key')
def asaas_webhook():
    base = 'https://api-sandbox.asaas.com/v3' if '_hmlg_' in asaas else 'https://api.asaas.com/v3'
    cab = {'access_token': asaas}
    url = f'https://asaas.{DOM}/webhooks/asaas'
    atuais = http('GET', base + '/webhooks', cab=cab).get('data', [])
    if any(w.get('url') == url for w in atuais):
        return 'já existia'
    http('POST', base + '/webhooks', {
        'name': 'Zeus', 'url': url, 'email': R['email'], 'enabled': True, 'interrupted': False, 'apiVersion': 3,
        'authToken': s('asaas_webhook_auth_token'), 'sendType': 'SEQUENTIALLY',
        'events': ['PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE',
                   'PAYMENT_DELETED', 'PAYMENT_REFUNDED']}, cab=cab)
    return f'criado -> {url}'
if asaas:
    tenta('Asaas, webhook', asaas_webhook)

# ---------- ClickUp ----------
cu = s('clickup_api_token')
def clickup_webhook():
    cab = {'Authorization': cu}
    times = http('GET', 'https://api.clickup.com/api/v2/team', cab=cab).get('teams', [])
    if not times:
        raise RuntimeError('token sem workspace')
    tid = times[0]['id']
    grava('clickup_workspace_id', tid)
    url = f'https://clickup.{DOM}/webhook'
    for w in http('GET', f'https://api.clickup.com/api/v2/team/{tid}/webhook', cab=cab).get('webhooks', []):
        if w.get('endpoint') == url:
            return 'já existia'
    w = http('POST', f'https://api.clickup.com/api/v2/team/{tid}/webhook', {'endpoint': url, 'events': ['*']}, cab=cab)
    grava('clickup_webhook_id', w.get('id', ''))
    grava('clickup_webhook_secret', (w.get('webhook') or {}).get('secret', ''))
    return f"criado no workspace {times[0].get('name')} -> {url}"
if cu:
    tenta('ClickUp, webhook', clickup_webhook)

# ---------- só pelo painel ----------
manual.append(f'Google Cloud (OAuth): URI de redirecionamento = https://google.{DOM}/oauth/callback ; origem JavaScript = https://google.{DOM}')
manual.append(f'ZapSign (Configurações > Webhooks): https://zapsign.{DOM}/webhook')

print('  APIs configuradas automaticamente:' + ('' if feito else ' nenhuma (sem chave ou aguardando SSL)'))
for x in feito: print('    ok  ' + x)
for x in falhou: print('    !!  ' + x)
print('  Configure no painel de cada serviço:')
for x in manual: print('    -   ' + x)
sys.exit(1 if falhou else 0)
