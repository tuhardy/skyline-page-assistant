import { setTimeout as delay } from 'node:timers/promises';

const [port = '9333', targetId, ...expressionParts] = process.argv.slice(2);
const expression = expressionParts[0] === '--base64'
  ? Buffer.from(expressionParts[1] || '', 'base64').toString('utf8')
  : expressionParts.join(' ');
if (!targetId || !expression) {
  throw new Error('Usage: node cdp-eval.mjs <port> <target-id> <JavaScript-expression>');
}

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = targets.find((item) => item.id === targetId);
if (!target) throw new Error(`CDP target not found: ${targetId}`);

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function call(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

try {
  await call('Runtime.enable');
  const result = await call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  console.log(JSON.stringify(result.result.value ?? null, null, 2));
} finally {
  socket.close();
  await delay(10);
}
