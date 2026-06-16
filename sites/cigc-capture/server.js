const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const PORT = 3003;

// Conecta ao banco de dados do worker
const DB_PATH = '/opt/jeff-worker/data/worker.db';
const db = new sqlite3.Database(DB_PATH);

// Função para enviar lead pro Gustavo via WhatsApp
async function notifyGustavo(leadData) {
    try {
        const message = `Novo lead CIGC 2026

Nome: ${leadData.name}
Tel: ${leadData.phone}
E-mail: ${leadData.email}
Cidade: ${leadData.city}
Clínica: ${leadData.clinic}
Instagram: ${leadData.instagram || 'N/A'}
Interesse: ${leadData.interest}`;

        const response = await fetch('http://127.0.0.1:3002/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId: '556296321433@c.us', // Gustavo
                message: message
            })
        });

        return response.ok;
    } catch (error) {
        console.error('Erro ao notificar Gustavo:', error);
        return false;
    }
}

// Função para salvar lead no banco
function saveLead(leadData) {
    return new Promise((resolve, reject) => {
        const sql = `
            INSERT INTO cigc_leads (name, email, phone, city, clinic, instagram, interest, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `;

        db.run(sql, [
            leadData.name,
            leadData.email,
            leadData.phone,
            leadData.city,
            leadData.clinic,
            leadData.instagram || '',
            leadData.interest
        ], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

// Cria tabela se não existir
db.run(`
    CREATE TABLE IF NOT EXISTS cigc_leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        city TEXT,
        clinic TEXT,
        instagram TEXT,
        interest TEXT,
        created_at TEXT,
        notified INTEGER DEFAULT 0
    )
`);

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // POST /api/leads - Recebe novo lead
    if (req.method === 'POST' && parsedUrl.pathname === '/api/leads') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                const leadData = JSON.parse(body);

                // Valida campos obrigatórios
                if (!leadData.name || !leadData.email || !leadData.phone) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Campos obrigatórios faltando' }));
                    return;
                }

                // Salva no banco
                await saveLead(leadData);

                // Notifica Gustavo assincronamente
                notifyGustavo(leadData).catch(console.error);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));

            } catch (error) {
                console.error('Erro ao processar lead:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Erro ao processar' }));
            }
        });
        return;
    }

    // GET / - Serve index.html
    if (req.method === 'GET' && parsedUrl.pathname === '/') {
        fs.readFile(path.join(__dirname, 'index.html'), 'utf8', (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Erro ao carregar página');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        });
        return;
    }

    // GET /api/leads - Lista leads (admin)
    if (req.method === 'GET' && parsedUrl.pathname === '/api/leads') {
        db.all('SELECT * FROM cigc_leads ORDER BY created_at DESC', (err, rows) => {
            if (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(rows));
        });
        return;
    }

    // 404
    res.writeHead(404);
    res.end('Não encontrado');
});

server.listen(PORT, () => {
    console.log(`🚀 CIGC Landing rodando em http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    db.close();
    process.exit(0);
});
