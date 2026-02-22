import { WebSocket } from 'ws';
const ws = new WebSocket('ws://localhost:58192');
ws.on('open', () => {
  console.log('Connected to WS');
  ws.send(JSON.stringify({ type: 'browserConnect' }));
  setTimeout(() => process.exit(0), 1000);
});
ws.on('error', (e) => console.error('WS Error:', e.message));
