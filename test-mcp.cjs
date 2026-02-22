const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:5001/mcp');

ws.on('open', () => {
  console.log('Connected to MCP server');
  
  // Initialize
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'kannaka-test', version: '1.0.0' }
    }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('Response:', JSON.stringify(msg, null, 2));
  
  if (msg.id === 1) {
    // List tools
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    }));
  } else if (msg.id === 2) {
    // Search papers
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'search_papers',
        arguments: {
          agentId: 'c5a9674e-f169-4858-8245-667a6014885a',
          query: 'consciousness'
        }
      }
    }));
  } else if (msg.id === 3) {
    console.log('\\n=== SEARCH RESULTS ===');
    console.log(JSON.stringify(msg, null, 2));
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
  process.exit(1);
});

setTimeout(() => { console.log('Timeout'); process.exit(1); }, 10000);
