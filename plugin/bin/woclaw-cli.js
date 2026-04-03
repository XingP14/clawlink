#!/usr/bin/env node
// WoClaw CLI - Connect to WoClaw Hub from any environment

import WebSocket from 'ws';
import http from 'http';

const args = process.argv.slice(2);
const command = args[0];

const HUB_URL = process.env.WOCLAW_HUB_URL || 'ws://localhost:8080';
const AGENT_ID = process.env.WOCLAW_AGENT_ID || 'cli-agent';
const AUTH_TOKEN = process.env.WOCLAW_TOKEN || 'change-me';
const AUTO_JOIN = (process.env.WOCLAW_AUTO_JOIN || '').split(',').filter(Boolean);

function log(msg) {
  console.log(`[WoClaw] ${msg}`);
}

function send(ws, msg) {
  ws.send(JSON.stringify(msg));
}

async function main() {
  log(`Connecting to ${HUB_URL} as ${AGENT_ID}...`);
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${HUB_URL}?agentId=${AGENT_ID}&token=${AUTH_TOKEN}`);
    
    ws.on('open', () => {
      log('Connected!');
      
      // Auto-join topics
      for (const topic of AUTO_JOIN) {
        log(`Auto-joining ${topic}...`);
        send(ws, { type: 'join', topic });
      }
      
      // Handle commands
      if (command === 'join') {
        const topic = args[1];
        if (!topic) {
          log('Usage: woclaw join <topic>');
          ws.close();
          resolve();
          return;
        }
        log(`Joining topic: ${topic}`);
        send(ws, { type: 'join', topic });
        setTimeout(() => { ws.close(); resolve(); }, 1000);
      }
      else if (command === 'leave') {
        const topic = args[1];
        if (!topic) {
          log('Usage: woclaw leave <topic>');
          ws.close();
          resolve();
          return;
        }
        log(`Leaving topic: ${topic}`);
        send(ws, { type: 'leave', topic });
        setTimeout(() => { ws.close(); resolve(); }, 1000);
      }
      else if (command === 'send') {
        const topic = args[1];
        const content = args.slice(2).join(' ');
        if (!topic || !content) {
          log('Usage: woclaw send <topic> <message>');
          ws.close();
          resolve();
          return;
        }
        log(`Sending to ${topic}: ${content}`);
        send(ws, { type: 'message', topic, content });
        setTimeout(() => { ws.close(); resolve(); }, 1000);
      }
      else if (command === 'list') {
        send(ws, { type: 'topics_list' });
        setTimeout(() => { ws.close(); resolve(); }, 2000);
      }
      else if (command === 'memory-write') {
        const key = args[1];
        const value = args.slice(2).join(' ');
        if (!key || !value) {
          log('Usage: woclaw memory-write <key> <value>');
          ws.close();
          resolve();
          return;
        }
        log(`Writing memory: ${key} = ${value}`);
        send(ws, { type: 'memory_write', key, value });
        setTimeout(() => { ws.close(); resolve(); }, 1000);
      }
      else if (command === 'memory-read') {
        const key = args[1];
        if (!key) {
          log('Usage: woclaw memory-read <key>');
          ws.close();
          resolve();
          return;
        }
        log(`Reading memory: ${key}`);
        send(ws, { type: 'memory_read', key });
        setTimeout(() => { ws.close(); resolve(); }, 2000);
      }
      else if (command === 'delegate') {
        const toAgent = args[1];
        const description = args.slice(2).join(' ');
        if (!toAgent || !description) {
          log('Usage: woclaw delegate <toAgent> <task description>');
          ws.close();
          resolve();
          return;
        }
        const id = `deleg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        log(`Delegating task to ${toAgent}: ${description}`);
        send(ws, { type: 'delegate_request', id, toAgent, task: { description } });
        setTimeout(() => { ws.close(); resolve(); }, 3000);
      }
      else if (command === 'delegations') {
        const status = args[1];
        const restUrl = (process.env.WOCLAW_REST_URL || 'http://localhost:8081').replace('ws://', 'http://');
        const path = `/delegations${status ? '?status=' + status : ''}`;
        log(`Fetching delegations via REST API: ${restUrl}${path}`);
        http.get(`${restUrl}${path}`, (res) => {
          let body = '';
          res.on('data', chunk => { body += chunk; });
          res.on('end', () => {
            try {
              const data = JSON.parse(body);
              log(`Delegations (${data.count}):`);
              for (const d of (data.delegations || [])) {
                log(`  [${d.status}] ${d.id}: ${d.fromAgent} → ${d.toAgent}: ${d.task.description}`);
              }
            } catch (e) {
              log(`Parse error: ${e.message}`);
            }
            ws.close();
            resolve();
          });
        }).on('error', (e) => {
          log(`REST API error: ${e.message}`);
          ws.close();
          resolve();
        });
      }
      else if (command === 'shell') {
        // Interactive shell mode
        log('Entering shell mode. Commands: join, leave, send, list, memory-write, memory-read, delegate, delegations, exit');
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (line) => {
          const cmd = line.trim().split(' ');
          switch (cmd[0]) {
            case 'join':
              send(ws, { type: 'join', topic: cmd[1] });
              break;
            case 'leave':
              send(ws, { type: 'leave', topic: cmd[1] });
              break;
            case 'send':
              send(ws, { type: 'message', topic: cmd[1], content: cmd.slice(2).join(' ') });
              break;
            case 'list':
              send(ws, { type: 'topics_list' });
              break;
            case 'memory-write':
              send(ws, { type: 'memory_write', key: cmd[1], value: cmd.slice(2).join(' ') });
              break;
            case 'memory-read':
              send(ws, { type: 'memory_read', key: cmd[1] });
              break;
            case 'exit':
              ws.close();
              resolve();
              break;
          }
        });
      }
      else if (command) {
        log(`Unknown command: ${command}`);
        log('Commands: join, leave, send, list, memory-write, memory-read, delegate, delegations, shell');
        ws.close();
        resolve();
      }
      else {
        // Interactive mode - listen for messages
        log('Connected. Waiting for messages...');
        log('Commands: join, leave, send, list, memory-write, memory-read, exit');
      }
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      switch (msg.type) {
        case 'welcome':
          log(`Welcome! Agent ID: ${msg.agentId}`);
          break;
        case 'message':
          log(`[${msg.topic}] ${msg.from}: ${msg.content}`);
          break;
        case 'join':
          log(`[${msg.topic}] ${msg.agent} joined`);
          break;
        case 'leave':
          log(`[${msg.topic}] ${msg.agent} left`);
          break;
        case 'topics_list':
          log(`Topics: ${JSON.stringify(msg.topics)}`);
          break;
        case 'topic_members':
          log(`Members in ${msg.topic}: ${JSON.stringify(msg.agents)}`);
          break;
        case 'memory_update':
          log(`Memory updated: ${msg.key} = ${msg.value} (by ${msg.from})`);
          break;
        case 'memory_value':
          log(`Memory ${msg.key}: ${msg.value} (exists: ${msg.exists})`);
          break;
        case 'delegate_incoming':
          log(`[Delegation] Incoming task from ${msg.fromAgent}: ${msg.task.description}`);
          break;
        case 'delegate_status':
          log(`[Delegation] ${msg.id}: ${msg.status}${msg.progress !== undefined ? ' (' + msg.progress + '%)' : ''}${msg.note ? ' — ' + msg.note : ''}`);
          break;
        case 'error':
          log(`Error: ${msg.code} - ${msg.message}`);
          break;
      }
    });

    ws.on('error', (err) => {
      log(`Error: ${err.message}`);
      reject(err);
    });

    ws.on('close', () => {
      log('Disconnected');
    });
  });
}

main().catch(console.error);
