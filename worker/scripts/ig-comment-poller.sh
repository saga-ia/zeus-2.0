#!/bin/bash
# Poller de comentários IG — varre os últimos N posts, casa keywords, responde + manda DM.
# Chamado por cron a cada 5min. Idempotência via tabela ig_processed_comments.
#
# Uso:
#   ig-comment-poller.sh           # roda real
#   ig-comment-poller.sh dry       # só lista o que faria
set -u
DB="/opt/jeff-worker/data/worker.db"
DRY="${1:-}"

python3 <<PY
import sys, sqlite3, urllib.request, urllib.parse, json
from datetime import datetime

DB = "$DB"
DRY = "$DRY" == "dry"

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row

def setting(k):
    r = conn.execute("SELECT value FROM app_settings WHERE key=?", (k,)).fetchone()
    return r['value'] if r else None

TOKEN = setting('jeff_meta_ig_user_token')
IG_ID = setting('jeff_meta_ig_account_id')
GRAPH = "https://graph.facebook.com/v19.0"
RECENT_POSTS = 10  # quantos posts varrer por execução

def gget(path, **params):
    params['access_token'] = TOKEN
    qs = urllib.parse.urlencode(params)
    sep = '&' if '?' in path else '?'
    req = urllib.request.Request(f"{GRAPH}{path}{sep}{qs}")
    return json.loads(urllib.request.urlopen(req, timeout=30).read())

def gpost(path, body):
    body['access_token'] = TOKEN
    data = urllib.parse.urlencode(body).encode()
    req = urllib.request.Request(f"{GRAPH}{path}", data=data, method='POST')
    try:
        return json.loads(urllib.request.urlopen(req, timeout=30).read())
    except urllib.error.HTTPError as e:
        return {"error": json.loads(e.read())}

# 1. busca keywords ativas
keywords = list(conn.execute("SELECT * FROM ig_keyword_responses WHERE active=1").fetchall())
if not keywords:
    print("Nenhuma keyword ativa. Saindo.")
    sys.exit(0)

print(f"Keywords ativas: {len(keywords)}")
for k in keywords:
    print(f"  - id={k['id']} | '{k['keyword']}' ({k['match_mode']}) | hits={k['hits']}")

# 2. lista posts recentes
posts = gget(f"/{IG_ID}/media", fields="id,permalink,timestamp", limit=RECENT_POSTS)
if posts.get('error'):
    print(f"ERR posts: {posts['error']}")
    sys.exit(1)

total_new = 0
total_actions = 0

# 3. pra cada post, lista comentários
for post in posts.get('data', []):
    media_id = post['id']
    cmts = gget(f"/{media_id}/comments", fields="id,text,username,timestamp,from", limit=50)
    if cmts.get('error'):
        print(f"  WARN comments {media_id}: {cmts['error']}")
        continue

    for c in cmts.get('data', []):
        cid = c['id']
        # idempotência
        seen = conn.execute("SELECT 1 FROM ig_processed_comments WHERE comment_id=?", (cid,)).fetchone()
        if seen: continue
        total_new += 1

        text = (c.get('text') or '').lower()
        username = c.get('username', '?')
        matched = None
        for k in keywords:
            kw = k['keyword'].lower()
            mode = k['match_mode']
            # filtro opcional por media
            if k['media_filter'] and k['media_filter'] != media_id:
                continue
            hit = (mode == 'exact' and text.strip() == kw) or \
                  (mode == 'contains' and kw in text) or \
                  (mode == 'starts' and text.lstrip().startswith(kw))
            if hit:
                matched = k
                break

        if not matched:
            # marca como processado mesmo sem match (não vai ficar varrendo eternamente)
            if not DRY:
                conn.execute("""INSERT INTO ig_processed_comments
                    (comment_id, media_id, username, text, matched_keyword_id)
                    VALUES (?,?,?,?,NULL)""",
                    (cid, media_id, username, c.get('text','')[:500]))
                conn.commit()
            continue

        sender_id = (c.get('from') or {}).get('id')
        print(f"\n  🎯 MATCH: @{username} on post {media_id[:12]}…")
        print(f"     comment: {c.get('text','')[:80]}")
        print(f"     keyword: '{matched['keyword']}' (id={matched['id']})")

        comment_replied = 0
        dm_sent = 0
        dm_error = None

        if DRY:
            print(f"     [DRY] would reply: {(matched['comment_reply'] or '')[:60]}")
            print(f"     [DRY] would DM: {matched['dm_message'][:60]}")
        else:
            # 1) reply público no comentário
            if matched['comment_reply']:
                r = gpost(f"/{cid}/replies", {"message": matched['comment_reply']})
                if r.get('error'):
                    print(f"     ⚠ reply fail: {r['error'].get('message','?')}")
                else:
                    comment_replied = 1
                    print(f"     ✅ reply enviado (id={r.get('id','?')})")

            # 2) DM via /messages
            if sender_id:
                msg_body = json.dumps({"recipient":{"id":sender_id},"message":{"text":matched['dm_message']}})
                req = urllib.request.Request(
                    f"{GRAPH}/{IG_ID}/messages?access_token={TOKEN}",
                    data=msg_body.encode(),
                    headers={"Content-Type":"application/json"},
                    method='POST'
                )
                try:
                    urllib.request.urlopen(req, timeout=30).read()
                    dm_sent = 1
                    print(f"     ✅ DM enviado pra user {sender_id}")
                except urllib.error.HTTPError as e:
                    err = e.read().decode()[:200]
                    dm_error = err
                    print(f"     ⚠ DM fail: {err}")
            else:
                dm_error = "sender_id ausente no comentário"
                print(f"     ⚠ DM skip: sem sender_id")

            conn.execute("""INSERT INTO ig_processed_comments
                (comment_id, media_id, username, text, matched_keyword_id, comment_replied, dm_sent, dm_error)
                VALUES (?,?,?,?,?,?,?,?)""",
                (cid, media_id, username, c.get('text','')[:500], matched['id'], comment_replied, dm_sent, dm_error))
            conn.execute("UPDATE ig_keyword_responses SET hits=hits+1, last_hit_at=datetime('now') WHERE id=?", (matched['id'],))
            conn.commit()
            total_actions += 1

print(f"\n=== Resumo: {total_new} comentários novos | {total_actions} ações disparadas ===")
PY
