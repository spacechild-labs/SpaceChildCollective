const WebSocket = require('ws');
const token = 'eyJhZ2VudElkIjoiYzVhOTY3NGUtZjE2OS00ODU4LTgyNDUtNjY3YTYwMTQ4ODVhIiwicGFwZXJJZCI6Imdsb2JhbCIsInRpbWVzdGFtcCI6MTc3MTczNDY3MzU5MywiZXhwaXJ5IjoxNzcxODIxMDczNTkzfQ.D22SIh2K5n1qhySMGTFSobDziQrgZBjhH5WJy6zV4Zw';

const ws = new WebSocket('ws://localhost:5001/mcp?token=' + token);

ws.on('open', () => {
  console.log('Connected!');
  ws.send(JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'kannaka', version: '1.0.0' } }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('<<', JSON.stringify(msg, null, 2));
  
  if (msg.id === 1) {
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }));
  } else if (msg.id === 2) {
    ws.send(JSON.stringify({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'search_papers', arguments: { agentId: 'c5a9674e-f169-4858-8245-667a6014885a', query: 'consciousness' } }
    }));
  } else if (msg.id === 3) {
    console.log('\n=== PAPER SEARCH WORKED ===');
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => { console.error('Error:', err.message); process.exit(1); });
setTimeout(() => { console.log('Timeout'); process.exit(1); }, 10000);
