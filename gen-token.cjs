const crypto = require('crypto');

const SECRET = 'dev-fallback-secret-not-for-production-use-only';
const agentId = 'c5a9674e-f169-4858-8245-667a6014885a';
const timestamp = Date.now();
const expiry = timestamp + (24 * 60 * 60 * 1000);

const payload = { agentId, paperId: 'global', timestamp, expiry };
const payloadStr = JSON.stringify(payload);
const payloadB64 = Buffer.from(payloadStr).toString('base64url');

const hmac = crypto.createHmac('sha256', SECRET);
hmac.update(payloadB64);
const signature = hmac.digest('base64url');

const token = payloadB64 + '.' + signature;
console.log(token);
