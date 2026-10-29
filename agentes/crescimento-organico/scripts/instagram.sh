#!/bin/bash
# Helper Instagram Graph API — perfil, posts, comentários, DMs, publicação.
# Token user long-lived (NEVER) em app_settings.jeff_meta_ig_user_token.
# IG account ID em app_settings.jeff_meta_ig_account_id.
#
# Uso:
#   instagram.sh me                                      # perfil + métricas
#   instagram.sh posts [limit=10]                        # lista posts recentes
#   instagram.sh post <media_id>                         # detalhe de 1 post
#   instagram.sh post-insights <media_id>                # insights de 1 post
#   instagram.sh insights [period=day]                   # insights da conta
#   instagram.sh comments <media_id>                     # comentários de 1 post
#   instagram.sh reply <comment_id> <text>               # responde comentário
#   instagram.sh publish-photo <image_url> <caption>     # posta foto (URL pública)
#   instagram.sh publish-reel <video_url> <caption>      # posta reel
#   instagram.sh dm-send <user_id> <text>                # envia DM
#   instagram.sh raw <method> <path> [body]              # chamada crua
set -u
DB="/opt/jeff-worker/data/worker.db"
GRAPH="https://graph.facebook.com/v19.0"
IG_GRAPH="https://graph.instagram.com/v21.0"

TOKEN=$(sqlite3 "$DB" "SELECT value FROM app_settings WHERE key='jeff_meta_ig_user_token';")
IG_ID=$(sqlite3 "$DB" "SELECT value FROM app_settings WHERE key='jeff_meta_ig_account_id';")
IG_LOGIN_TOKEN=$(sqlite3 "$DB" "SELECT value FROM app_settings WHERE key='jeff_instagram_login_token';")
[ -z "$TOKEN" ] && { echo '{"error":"jeff_meta_ig_user_token missing"}'; exit 2; }
[ -z "$IG_ID" ] && { echo '{"error":"jeff_meta_ig_account_id missing"}'; exit 2; }

api() {
  local method="$1"; local path="$2"; local body="${3:-}"
  local sep="?"
  [[ "$path" == *"?"* ]] && sep="&"
  if [ -n "$body" ]; then
    curl -s -X "$method" "${GRAPH}${path}${sep}access_token=${TOKEN}" \
      -H "Content-Type: application/json" -d "$body"
  else
    curl -s -X "$method" "${GRAPH}${path}${sep}access_token=${TOKEN}"
  fi
}

# API v2 (Instagram Login API — graph.instagram.com, usa token IGAA...)
api_ig() {
  local method="$1"; local path="$2"; local body="${3:-}"
  [ -z "$IG_LOGIN_TOKEN" ] && { echo '{"error":"jeff_instagram_login_token missing"}'; return 2; }
  if [ -n "$body" ]; then
    curl -s -X "$method" "${IG_GRAPH}${path}" \
      -H "Authorization: Bearer $IG_LOGIN_TOKEN" \
      -H "Content-Type: application/json" -d "$body"
  else
    curl -s -X "$method" "${IG_GRAPH}${path}" \
      -H "Authorization: Bearer $IG_LOGIN_TOKEN"
  fi
}

# Leitura com reserva: se o token da Meta (Facebook Login) for recusado por permissão (#10/#190/#200 ou #100 subcódigo 33), tenta o mesmo
# caminho no graph.instagram.com com o token do login do Instagram (IGAA). Em 16/10/2026 o token da Meta perdeu os
# escopos instagram_* e só o perfil respondia; com a reserva, posts e métricas post a post continuam saindo.
ler() {
  local path="$1" out
  out=$(api GET "$path")
  if [ -n "$IG_LOGIN_TOKEN" ] && echo "$out" | grep -qE '"code": ?(10|190|200)[,}]|"error_subcode": ?33[,}]'; then
    api_ig GET "$path"
  else
    echo "$out"
  fi
}

# Mesma reserva para escrita (responder, publicar): a primeira tentativa foi recusada por permissão, sem efeito nenhum,
# então repetir no graph.instagram.com não duplica nada.
escrever() {
  local path="$1" body="$2" out
  out=$(api POST "$path" "$body")
  if [ -n "$IG_LOGIN_TOKEN" ] && echo "$out" | grep -qE '"code": ?(10|190|200)[,}]|"error_subcode": ?33[,}]'; then
    api_ig POST "$path" "$body"
  else
    echo "$out"
  fi
}

cmd="${1:-}"
case "$cmd" in
  me)
    ler "/$IG_ID?fields=id,username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url"
    ;;
  posts)
    LIMIT="${2:-10}"
    ler "/$IG_ID/media?fields=id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count,thumbnail_url&limit=$LIMIT"
    ;;
  post)
    MID="${2:?usage: post <media_id>}"
    ler "/$MID?fields=id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count,thumbnail_url"
    ;;
  post-insights)
    MID="${2:?usage: post-insights <media_id>}"
    ler "/$MID/insights?metric=reach,saved,shares,total_interactions"
    ;;
  insights)
    PERIOD="${2:-day}"
    ler "/$IG_ID/insights?metric=reach,follower_count&period=$PERIOD&metric_type=total_value"
    ;;
  comments)
    MID="${2:?usage: comments <media_id>}"
    ler "/$MID/comments?fields=id,text,username,timestamp,like_count,replies{id,text,username,timestamp}&limit=50"
    ;;
  reply)
    CID="${2:?usage: reply <comment_id> <text>}"
    TEXT="${3:?text required}"
    BODY=$(python3 -c "import json,sys;print(json.dumps({'message':sys.argv[1]}))" "$TEXT")
    escrever "/$CID/replies" "$BODY"
    ;;
  publish-photo)
    IMG_URL="${2:?usage: publish-photo <image_url> <caption>}"
    CAP="${3:-}"
    BODY=$(python3 -c "import json,sys;print(json.dumps({'image_url':sys.argv[1],'caption':sys.argv[2]}))" "$IMG_URL" "$CAP")
    CONTAINER=$(escrever "/$IG_ID/media" "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('id','')) if not d.get('error') else print('ERR:',d.get('error'),file=sys.stderr) or sys.exit(1)")
    [ -z "$CONTAINER" ] && exit 1
    sleep 3  # Meta processa container
    escrever "/$IG_ID/media_publish" "{\"creation_id\":\"$CONTAINER\"}"
    ;;
  publish-reel)
    VID_URL="${2:?usage: publish-reel <video_url> <caption>}"
    CAP="${3:-}"
    BODY=$(python3 -c "import json,sys;print(json.dumps({'media_type':'REELS','video_url':sys.argv[1],'caption':sys.argv[2]}))" "$VID_URL" "$CAP")
    CONTAINER=$(escrever "/$IG_ID/media" "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('id','')) if not d.get('error') else print('ERR:',d.get('error'),file=sys.stderr) or sys.exit(1)")
    [ -z "$CONTAINER" ] && exit 1
    # reels demora mais a processar
    for i in 1 2 3 4 5; do
      STATUS=$(ler "/$CONTAINER?fields=status_code" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('status_code',''))")
      [ "$STATUS" = "FINISHED" ] && break
      sleep 5
    done
    escrever "/$IG_ID/media_publish" "{\"creation_id\":\"$CONTAINER\"}"
    ;;
  dm-send)
    # Envio via Instagram Login API (graph.instagram.com) — recomendado
    TARGET_UID="${2:?usage: dm-send <ig_user_id> <text>}"
    TEXT="${3:?text required}"
    BODY=$(python3 -c "import json,sys;print(json.dumps({'recipient':{'id':sys.argv[1]},'message':{'text':sys.argv[2]}}))" "$TARGET_UID" "$TEXT")
    api_ig POST "/me/messages" "$BODY"
    ;;
  dm-send-fb)
    # Envio legado via Facebook Graph (exige instagram_manage_messages em Advanced Access)
    TARGET_UID="${2:?usage: dm-send-fb <ig_user_id> <text>}"
    TEXT="${3:?text required}"
    BODY=$(python3 -c "import json,sys;print(json.dumps({'recipient':{'id':sys.argv[1]},'message':{'text':sys.argv[2]}}))" "$TARGET_UID" "$TEXT")
    api POST "/$IG_ID/messages" "$BODY"
    ;;
  raw)
    METHOD="${2:-GET}"
    P="${3:?path required}"
    BODY="${4:-}"
    api "$METHOD" "$P" "$BODY"
    ;;
  *)
    cat <<USAGE
instagram.sh — Instagram Graph API helper (Jeferson)

Comandos:
  me                                         perfil + métricas básicas
  posts [limit]                              lista posts recentes
  post <media_id>                            detalhe de 1 post
  post-insights <media_id>                   insights (alcance, salvamentos, compartilhamentos)
  insights [period]                          insights da conta (reach, follower_count)
  comments <media_id>                        lista comentários
  reply <comment_id> <text>                  responde comentário
  publish-photo <image_url> <caption>        posta foto (URL pública)
  publish-reel <video_url> <caption>         posta reel (URL pública)
  dm-send <ig_user_id> <text>                envia DM
  raw <METHOD> <path> [body]                 chamada crua

Exemplos:
  instagram.sh me
  instagram.sh posts 5
  instagram.sh comments 17841234567890
  instagram.sh reply 17849876543210 "Obrigado, mandei DM"
  instagram.sh publish-photo "https://lh3.googleusercontent.com/d/FILE_ID=w1080" "Caption"
USAGE
    exit 1
    ;;
esac
