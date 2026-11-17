#!/usr/bin/env python3
"""Envia email de alerta.

Uso: email-alerta.py "assunto" "corpo" dest1 [dest2 ...]

1o caminho: Gmail API pela conta Google já conectada no Zeus (OAuth, tabela google_oauth_tokens),
   conta definida em EMAIL_ALERTA_CONTA (padrão: a 1a conta de google_oauth_tokens). Token renovado via google.sh.
2o caminho (reserva): SMTP, se SMTP_HOST/SMTP_USER/SMTP_PASS existirem em /opt/jeff-worker/.env.
Sai com 0 se enviou, 1 se falhou.
"""
import os, sys, smtplib, ssl, json, base64, subprocess, urllib.request, urllib.error
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, formatdate

ENV_FILE = "/opt/jeff-worker/.env"
GOOGLE_SH = "/opt/jeff-worker/scripts/google.sh"
DB = "/opt/jeff-worker/data/worker.db"
NOME = os.environ.get("EMAIL_ALERTA_NOME") or "Zeus"


def conta_google():
    c = os.environ.get("EMAIL_ALERTA_CONTA", "").strip()
    if c:
        return c
    r = subprocess.run(["sqlite3", DB, "SELECT user_key FROM google_oauth_tokens WHERE provider='google' "
                        "ORDER BY updated_at DESC LIMIT 1;"], capture_output=True, text=True, timeout=10)
    return r.stdout.strip()


def montar(assunto, corpo, destinos, remetente):
    msg = EmailMessage()
    msg["Subject"] = assunto
    msg["From"] = formataddr((NOME, remetente))
    msg["To"] = ", ".join(destinos)
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid()
    msg.set_content(corpo)
    return msg


def via_gmail(assunto, corpo, destinos):
    CONTA = conta_google()
    if not CONTA:
        raise RuntimeError("nenhuma conta Google conectada")
    tok = subprocess.run([GOOGLE_SH, "token", CONTA], capture_output=True, text=True, timeout=30).stdout.strip()
    if not tok or tok.startswith("ERROR"):
        raise RuntimeError(f"sem token Google para {CONTA}")
    raw = base64.urlsafe_b64encode(montar(assunto, corpo, destinos, CONTA).as_bytes()).decode().rstrip("=")
    req = urllib.request.Request(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        data=json.dumps({"raw": raw}).encode(),
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
    )
    try:
        r = json.loads(urllib.request.urlopen(req, timeout=30).read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Gmail API {e.code}: {e.read().decode()[:300]}")
    return f"gmail ({CONTA}) id {r.get('id')}"


def carregar_smtp():
    cfg = {}
    try:
        with open(ENV_FILE, encoding="utf-8") as f:
            for linha in f:
                linha = linha.strip()
                if "=" in linha and linha.startswith("SMTP_"):
                    k, v = linha.split("=", 1)
                    cfg[k.strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    return cfg


def via_smtp(assunto, corpo, destinos):
    cfg = carregar_smtp()
    host, user, senha = cfg.get("SMTP_HOST"), cfg.get("SMTP_USER"), cfg.get("SMTP_PASS")
    if not (host and user and senha):
        raise RuntimeError("SMTP não configurado")
    porta = int(cfg.get("SMTP_PORT") or 587)
    msg = montar(assunto, corpo, destinos, cfg.get("SMTP_FROM") or user)
    ctx = ssl.create_default_context()
    if porta == 465:
        with smtplib.SMTP_SSL(host, porta, context=ctx, timeout=30) as s:
            s.login(user, senha); s.send_message(msg)
    else:
        with smtplib.SMTP(host, porta, timeout=30) as s:
            s.starttls(context=ctx); s.login(user, senha); s.send_message(msg)
    return f"smtp ({host})"


def main():
    if len(sys.argv) < 4:
        print(__doc__, file=sys.stderr)
        return 1
    assunto, corpo, destinos = sys.argv[1], sys.argv[2], sys.argv[3:]
    erros = []
    for nome, fn in (("gmail", via_gmail), ("smtp", via_smtp)):
        try:
            print("email-alerta: enviado por " + fn(assunto, corpo, destinos) + " para " + ", ".join(destinos))
            return 0
        except Exception as e:  # noqa: BLE001
            erros.append(f"{nome}: {e}")
    print("email-alerta: falhou (" + " | ".join(erros) + ")", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
