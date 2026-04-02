#!/usr/bin/env node
/**
 * WoClaw CLI - Improved CLI for WoClaw Hub
 * Supports both REST API and WebSocket connections
 * 
 * Usage:
 *   woclaw status                    # Check hub health (REST)
 *   woclaw topics                    # List topics (REST)
 *   woclaw topics <name> [limit]     # Get topic messages (REST)
 *   woclaw memory                    # List all memory (REST)
 *   woclaw memory <key>              # Read memory value (REST)
 *   woclaw memory write <key> <val>  # Write memory (REST)
 *   woclaw memory delete <key>       # Delete memory (REST)
 *   woclaw agents                    # List connected agents (REST)
 *   woclaw send <topic> <message>    # Send message (WebSocket)
 *   woclaw join <topic>              # Join topic (WebSocket)
 *   woclaw --help                    # Show help
 */

import WebSocket from 'ws';

// Configuration from environment
const HUB_REST = process.env.WOCLAW_REST_URL || process.env.WOCLAW_HUB_URL?.replace('ws://', 'http://').replace('wss://', 'https://') || 'http://localhost:8083';
const HUB_WS = process.env.WOCLAW_WS_URL || process.env.WOCLAW_HUB_URL || 'ws://localhost:8082';
const HUB_TOKEN = process.env.WOCLAW_TOKEN || process.env.WOCLAW_AUTH_TOKEN || 'WoClaw2026';
const AGENT_ID = process.env.WOCLAW_AGENT_ID || 'woclaw-cli-' + Math.random().toString(36).slice(2, 7);

const args = process.argv.slice(2);
const command = args[0];

// ANSI colors
const dim = s => `\x1b[2m${s}\x1b[0m`;
const bold = s => `\x1b[1m${s}\x1b[0m`;
const green = s => `\x1b[32m${s}\x1b[0m`;
const red = s => `\x1b[31m${s}\x1b[0m`;
const cyan = s => `\x1b[36m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;

function log(msg) { console.log(msg); }
function err(msg) { console.error(red(`Error: ${msg}`)); }

function usage() {
  log(bold('WoClaw CLI') + ` v0.3.0 — Connect to WoClaw Hub`);
  log('');
  log(bold('REST API Commands (fast, stateless):'));
  log(`  ${cyan('woclaw status')}                 Check hub health`);
  log(`  ${cyan('woclaw topics')}                 List all topics`);
  log(`  ${cyan('woclaw topics <name> [limit]')}  Get messages from a topic`);
  log(`  ${cyan('woclaw memory')}                 List all memory keys`);
  log(`  ${cyan('woclaw memory <key>')}           Read a memory value`);
  log(`  ${cyan('woclaw memory write <k> <v>')}   Write memory (use WOCLAW_TOKEN env for auth)`);
  log(`  ${cyan('woclaw memory delete <key>')}   Delete a memory key`);
  log(`  ${cyan('woclaw agents')}                 List connected agents`);
  log('');
  log(bold('WebSocket Commands (real-time):'));
  log(`  ${cyan('woclaw send <topic> <msg>')}     Send a message to a topic`);
  log(`  ${cyan('woclaw join <topic>')}           Join a topic and listen`);
  log('');
  log(bold('Options:'));
  log(`  ${dim('--hub <url>')}    Override Hub REST URL`);
  log(`  ${dim('--ws <url>')}     Override Hub WebSocket URL`);
  log(`  ${dim('--token <t>')}    Override auth token`);
  log('');
  log(bold('Environment:'));
  log(`  ${dim('WOCLAW_REST_URL')}   Hub REST API URL (default: http://localhost:8083)`);
  log(`  ${dim('WOCLAW_WS_URL')}     Hub WebSocket URL (default: ws://localhost:8082)`);
  log(`  ${dim('WOCLAW_TOKEN')}      Auth token (default: WoClaw2026)`);
  log(`  ${dim('WOCLAW_AGENT_ID')}  Agent ID (default: woclaw-cli-<random>)`);
}

// Parse global flags before command
let i = 0;
while (i < args.length && args[i]?.startsWith('--')) {
  const flag = args[i++];
  if (flag === '--hub' && args[i]) HUB_REST = args[i++];
  else if (flag === '--ws' && args[i]) HUB_WS = args[i++];
  else if (flag === '--token' && args[i]) HUB_TOKEN = args[i++];
  else if (flag === '--help') { usage(); process.exit(0); }
}

// REST helper
async function rest(path, options = {}) {
  const url = `${HUB_REST}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (options.auth !== false && HUB_TOKEN) {
    headers['Authorization'] = `Bearer ${HUB_TOKEN}`;
  }
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json();
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Commands
async function cmdStatus() {
  try {
    const data = await rest('/health');
    log(bold('WoClaw Hub') + ` — ${green('● Online')}`);
    log(`  URL:        ${HUB_REST}`);
    log(`  Uptime:     ${formatUptime(data.uptime)}`);
    log(`  Agents:     ${data.agents}`);
    log(`  Topics:     ${data.topics}`);
    log(`  Timestamp:  ${new Date(data.timestamp).toISOString()}`);
  } catch (e) {
    err(`Cannot connect to Hub at ${HUB_REST}`);
    err(e.message);
    process.exit(1);
  }
}

async function cmdTopics() {
  try {
    const data = await rest('/topics');
    if (!data.topics || data.topics.length === 0) {
      log('No topics yet.');
    } else {
      log(bold('Topics:'));
      for (const t of data.topics) {
        log(`  ${cyan(t.name)}  — ${t.agents} agent${t.agents !== 1 ? 's' : ''}`);
      }
    }
  } catch (e) {
    err(e.message);
    process.exit(1);
  }
}

async function cmdTopicMessages(topicName, limit = 50) {
  try {
    const data = await rest(`/topics/${encodeURIComponent(topicName)}?limit=${limit}`);
    log(bold(`Topic: ${cyan(topicName)}`) + ` (${data.count} messages)`);
    if (!data.messages || data.messages.length === 0) {
      log('  No messages yet.');
    } else {
      for (const msg of data.messages) {
        const time = new Date(msg.timestamp).toISOString().replace('T', ' ').slice(0, 19);
        log(`  ${dim(time)} ${yellow(msg.from || 'system')}: ${msg.content}`);
      }
    }
  } catch (e) {
    err(e.message);
    process.exit(1);
  }
}

async function cmdMemoryList() {
  try {
    const data = await rest('/memory');
    if (!data.memory || data.memory.length === 0) {
      log('No memory entries yet.');
    } else {
      log(bold(`Memory (${data.memory.length} entries):`));
      for (const m of data.memory) {
        const preview = typeof m.value === 'string' && m.value.length > 60 
          ? m.value.slice(0, 60) + '...' 
          : m.value;
        log(`  ${cyan(m.key)}  = ${preview}  ${dim(`(${m.tags?.join(',') || 'no tags'}) by ${m.updatedBy || '?'}`)}`);
      }
    }
  } catch (e) {
    err(e.message);
    process.exit(1);
  }
}

async function cmdMemoryRead(key) {
  try {
    const data = await rest(`/memory/${encodeURIComponent(key)}`);
    log(bold(`Memory: ${cyan(key)}`));
    log(`  Value:    ${data.value}`);
    log(`  Tags:     ${data.tags?.join(', ') || '(none)'}`);
    log(`  TTL:      ${data.ttl || 'none'}`);
    log(`  Updated:  ${data.updatedBy || '?'} @ ${data.updatedAt ? new Date(data.updatedAt).toISOString() : '?'}`);
  } catch (e) {
    if (e.message.includes('404')) {
      err(`Key "${key}" not found`);
    } else {
      err(e.message);
    }
    process.exit(1);
  }
}

async function cmdMemoryWrite(key, value) {
  try {
    const data = await rest('/memory', {
      method: 'POST',
      body: JSON.stringify({ key, value }),
    });
    log(green(`✓ Memory written: ${key}`));
    if (data.tags?.length) log(`  Tags: ${data.tags.join(', ')}`);
  } catch (e) {
    err(e.message);
    process.exit(1);
  }
}

async function cmdMemoryDelete(key) {
  try {
    await rest(`/memory/${encodeURIComponent(key)}`, { method: 'DELETE' });
    log(green(`✓ Memory deleted: ${key}`));
  } catch (e) {
    if (e.message.includes('404')) {
      err(`Key "${key}" not found`);
    } else {
      err(e.message);
    }
    process.exit(1);
  }
}

async function cmdAgents() {
  try {
    const data = await rest('/health');
    log(bold('Connected Agents:') + ` ${data.agents}`);
    log(`  (Use WebSocket protocol for agent list — REST shows: ${data.agents} connected)`);
  } catch (e) {
    err(e.message);
    process.exit(1);
  }
}

// WebSocket: send message
async function wsSend(topic, content) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${HUB_WS}?agentId=${AGENT_ID}&token=${HUB_TOKEN}`);
    const timeout = setTimeout(() => { ws.close(); resolve(); }, 2000);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'message', topic, content }));
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.type === 'ack' || msg.type === 'message') {
        log(green(`✓ Sent to ${topic}`));
      } else if (msg.type === 'error') {
        err(`${msg.code}: ${msg.message}`);
      }
    });
    ws.on('error', (e) => { err(e.message); reject(e); });
    ws.on('close', () => { clearTimeout(timeout); resolve(); });
  });
}

// WebSocket: join topic and listen briefly
async function wsJoin(topic) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${HUB_WS}?agentId=${AGENT_ID}&token=${HUB_TOKEN}`);
    log(`${dim('[WS]')} Connecting to ${HUB_WS}...`);
    ws.on('open', () => {
      log(green(`✓ Joined topic: ${topic}`));
      ws.send(JSON.stringify({ type: 'join', topic }));
      // Listen for 3 seconds then exit
      setTimeout(() => { ws.close(); resolve(); }, 3000);
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.type === 'message') {
        log(`${dim(`[${msg.topic}]`)} ${yellow(msg.from || '?')}: ${msg.content}`);
      } else if (msg.type === 'join' || msg.type === 'leave') {
        log(`${dim(`[${msg.topic}]`)} ${msg.agent || msg.from} ${msg.type === 'join' ? 'joined' : 'left'}`);
      } else if (msg.type === 'topics_list') {
        log(`${dim('Topics:')} ${msg.topics?.join(', ')}`);
      }
    });
    ws.on('error', (e) => { err(e.message); reject(e); });
    ws.on('close', () => resolve());
  });
}

// Main dispatcher
async function main() {
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    usage();
    return;
  }

  switch (command) {
    case 'status': {
      await cmdStatus();
      break;
    }
    case 'topics': {
      if (!args[1]) {
        await cmdTopics();
      } else {
        await cmdTopicMessages(args[1], parseInt(args[2] || '50'));
      }
      break;
    }
    case 'memory': {
      if (!args[1]) {
        await cmdMemoryList();
      } else if (args[1] === 'write') {
        if (!args[2] || !args[3]) { err('Usage: woclaw memory write <key> <value>'); process.exit(1); }
        await cmdMemoryWrite(args[2], args.slice(3).join(' '));
      } else if (args[1] === 'delete') {
        if (!args[2]) { err('Usage: woclaw memory delete <key>'); process.exit(1); }
        await cmdMemoryDelete(args[2]);
      } else {
        await cmdMemoryRead(args[1]);
      }
      break;
    }
    case 'agents': {
      await cmdAgents();
      break;
    }
    case 'send': {
      if (!args[1] || !args[2]) { err('Usage: woclaw send <topic> <message>'); process.exit(1); }
      await wsSend(args[1], args.slice(2).join(' '));
      break;
    }
    case 'join': {
      if (!args[1]) { err('Usage: woclaw join <topic>'); process.exit(1); }
      await wsJoin(args[1]);
      break;
    }
    default: {
      err(`Unknown command: ${command}`);
      log(`Run ${cyan('woclaw --help')} for usage.`);
      process.exit(1);
    }
  }
}

main().catch(e => { err(e.message); process.exit(1); });
