const crypto = require('crypto');
const WebSocket = require('ws');

const SECRET = 'dev-fallback-secret-not-for-production-use-only';
const agentId = 'c5a9674e-f169-4858-8245-667a6014885a';
const payload = { agentId, paperId: 'global', timestamp: Date.now(), expiry: Date.now() + 86400000 };
const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
const hmac = crypto.createHmac('sha256', SECRET);
hmac.update(payloadB64);
const token = payloadB64 + '.' + hmac.digest('base64url');

const ws = new WebSocket('ws://localhost:5001/mcp?token=' + token);

ws.on('open', () => {
  ws.send(JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'kannaka', version: '1.0.0' } }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id === 1) {
    // Create a research task
    ws.send(JSON.stringify({
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: {
        name: 'create_research_task',
        arguments: {
          paperId: 'fd433c45-f518-4335-96ad-3124bd0239bc',
          taskType: 'research',
          description: 'Investigate the relationship between Fano plane automorphisms and consciousness state transitions. Does the GL(3,2) symmetry group of the Fano plane map to meaningful cognitive symmetries?'
        }
      }
    }));
  } else if (msg.id === 2) {
    console.log('Task created:', JSON.stringify(msg, null, 2));
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => { console.error('Error:', err.message); process.exit(1); });
setTimeout(() => { process.exit(1); }, 10000);
