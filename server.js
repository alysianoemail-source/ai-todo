// AI Todo sync server — minimal Node.js backend
// Serves static files, proxies AI API calls, backs up to Feishu
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = process.env.PORT || 3000;
const BASE = __dirname;
const DATA_FILE = path.join(BASE, '.data', 'todos.json');
const FEISHU_TOKEN = 'GTLDbmtwqoxMEixoO3GckQSsnPh';
let lastFeishuSync = 0;

if (process.env.NODE_ENV !== 'production') {
  fs.mkdirSync(path.join(BASE, '.data'), { recursive: true });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/plain'
};

function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
  catch { return []; }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf-8');
  // Auto-sync to Feishu (throttled: max once per 60s)
  const now = Date.now();
  if (now - lastFeishuSync > 60000) {
    lastFeishuSync = now;
    syncToFeishu(data);
  }
}

function syncToFeishu(todos) {
  try {
    // Format as readable Markdown + embedded JSON
    const pending = todos.filter(t => t.status !== 'completed');
    const lines = ['# AI Todo', '', '> 自动同步 ' + new Date().toLocaleString('zh-CN'), ''];
    for (const t of pending) {
      const p = t.priorityLabel === 'high' ? '🔴' : t.priorityLabel === 'medium' ? '🟡' : '🟢';
      lines.push('- [' + (t.status === 'completed' ? 'x' : ' ') + '] ' + p + ' ' + t.title + ' ⏱' + (t.estimatedMinutes || '?') + 'min');
      if (t.subTasks && t.subTasks.length) {
        t.subTasks.forEach(st => lines.push('  - [' + (st.done ? 'x' : ' ') + '] ' + st.title));
      }
    }
    lines.push('', '<!-- DATA', JSON.stringify(todos), '-->');
    const md = lines.join('\n');

    // Write temp file and upload via lark-cli
    const tmpFile = path.join(BASE, '.data', 'feishu-sync.md');
    fs.writeFileSync(tmpFile, md, 'utf-8');
    execSync('lark-cli markdown +overwrite --file-token ' + FEISHU_TOKEN + ' --file .data/feishu-sync.md --as user', {
      cwd: BASE, timeout: 15000, stdio: 'ignore'
    });
  } catch(e) {
    // Feishu sync is best-effort, don't break the main flow
  }
}

function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // API: GET /api/sync — load saved data
  if (req.method === 'GET' && req.url === '/api/sync') {
    return json(res, { ok: true, data: loadData() });
  }

  // API: POST /api/sync — save data
  if (req.method === 'POST' && req.url === '/api/sync') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const todos = JSON.parse(body);
        saveData(todos);
        json(res, { ok: true, count: todos.length });
      } catch(e) {
        json(res, { ok: false, error: 'invalid json' }, 400);
      }
    });
    return;
  }

  // API: POST /api/groq — proxy to Groq AI (avoids CORS)
  if (req.method === 'POST' && req.url === '/api/groq') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      var groqReq = https.request({
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (process.env.GROQ_KEY || '')
        }
      }, function(groqRes) {
        var data = '';
        groqRes.on('data', c => data += c);
        groqRes.on('end', () => {
          res.writeHead(groqRes.statusCode, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(data);
        });
      });
      groqReq.on('error', () => {
        res.writeHead(502);
        res.end('{"error":"Groq unavailable"}');
      });
      groqReq.write(body);
      groqReq.end();
    });
    return;
  }

  // Static files
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(BASE, filePath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(BASE)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
});

server.listen(PORT, () => {
  console.log('AI Todo server running on port ' + PORT);
});
