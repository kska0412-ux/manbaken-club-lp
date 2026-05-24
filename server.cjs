const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');

const rootDir = __dirname;
const startPort = Number(process.env.PORT || 4173);
const host = '127.0.0.1';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

function send(response, statusCode, body, headers) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    ...headers
  });
  response.end(body);
}

function json(response, statusCode, payload) {
  send(response, statusCode, JSON.stringify(payload), {
    'Content-Type': 'application/json; charset=utf-8'
  });
}

async function readBody(request) {
  var chunks = [];
  var total = 0;

  for await (const chunk of request) {
    total += chunk.length;
    if (total > 1024 * 1024) {
      throw new Error('Payload too large');
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
}

function resolveFile(urlPath) {
  var pathname = decodeURIComponent(urlPath.split('?')[0]);

  if (pathname === '/') {
    pathname = '/index.html';
  }

  var filePath = path.normalize(path.join(rootDir, pathname));

  if (!filePath.startsWith(rootDir)) {
    return null;
  }

  return filePath;
}

async function handleSave(request, response) {
  try {
    var raw = await readBody(request);
    var payload = JSON.parse(raw);
    var html = String(payload.html || '');

    if (!html.trim().toLowerCase().startsWith('<!doctype html>')) {
      return json(response, 400, {
        ok: false,
        error: 'HTML形式が正しくありません'
      });
    }

    if (!html.includes('競馬 LINE友だち追加LP') || !html.includes('updateResultData')) {
      return json(response, 400, {
        ok: false,
        error: 'LPファイルとして保存できません'
      });
    }

    await fs.writeFile(path.join(rootDir, 'index.html'), html, 'utf8');
    json(response, 200, {
      ok: true
    });
  } catch (error) {
    json(response, 500, {
      ok: false,
      error: error.message
    });
  }
}

async function handleRequest(request, response) {
  try {
    var requestUrl = new URL(request.url, 'http://' + host);

    if (request.method === 'POST' && requestUrl.pathname === '/api/save-lp') {
      await handleSave(request, response);
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      send(response, 405, 'Method Not Allowed', {
        'Content-Type': 'text/plain; charset=utf-8'
      });
      return;
    }

    var filePath = resolveFile(requestUrl.pathname);

    if (!filePath) {
      send(response, 403, 'Forbidden', {
        'Content-Type': 'text/plain; charset=utf-8'
      });
      return;
    }

    var data = await fs.readFile(filePath);
    var contentType = mimeTypes[path.extname(filePath)] || 'application/octet-stream';

    send(response, 200, request.method === 'HEAD' ? '' : data, {
      'Content-Type': contentType
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      send(response, 404, 'Not Found', {
        'Content-Type': 'text/plain; charset=utf-8'
      });
      return;
    }

    json(response, 500, {
      ok: false,
      error: error.message
    });
  }
}

function listen(port) {
  var server = http.createServer(handleRequest);

  server.once('error', function (error) {
    if (error.code === 'EADDRINUSE' && port < startPort + 20) {
      listen(port + 1);
      return;
    }

    throw error;
  });

  server.listen(port, host, function () {
    console.log('LP:     http://' + host + ':' + port + '/');
    console.log('Editor: http://' + host + ':' + port + '/editor.html');
  });
}

listen(startPort);
