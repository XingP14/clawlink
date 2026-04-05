import * as vscode from 'vscode';
import * as http from 'http';

interface HubHealth {
  status: string;
  agents: number;
  topics: number;
}

let statusBarItem: vscode.StatusBarItem;
let pollTimer: NodeJS.Timeout | null = null;

function getHubUrl(): string {
  return vscode.workspace.getConfiguration('woclaw').get<string>('hubUrl') || 'http://localhost:8083';
}

async function fetchHubHealth(): Promise<HubHealth | null> {
  return new Promise((resolve) => {
    const url = getHubUrl();
    const req = http.get(`${url}/health`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(3000, () => { req.destroy(); resolve(null); });
  });
}

async function updateStatusBar() {
  const cfg = vscode.workspace.getConfiguration('woclaw');
  if (!cfg.get<boolean>('statusBar')) {
    statusBarItem.hide();
    return;
  }

  const health = await fetchHubHealth();
  if (health && health.status === 'ok') {
    statusBarItem.text = `$(hubot) WoClaw: ${health.agents} agents / ${health.topics} topics`;
    statusBarItem.color = '#4caf50';
    statusBarItem.tooltip = `Connected to ${getHubUrl()}`;
    statusBarItem.show();
  } else {
    statusBarItem.text = `$(hubot) WoClaw: Disconnected`;
    statusBarItem.color = '#f44336';
    statusBarItem.tooltip = `Cannot reach ${getHubUrl()}`;
    statusBarItem.show();
  }
}

export function activate(_context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = 'woclaw.showDashboard';

  // Poll every 30 seconds
  updateStatusBar();
  pollTimer = setInterval(updateStatusBar, 30_000);

  // Register dashboard command
  vscode.commands.registerCommand('woclaw.showDashboard', async () => {
    const health = await fetchHubHealth();
    const url = getHubUrl();
    if (health) {
      vscode.window.showInformationMessage(
        `WoClaw Hub: ${health.agents} agents, ${health.topics} topics — ${url}`,
        { modal: false }
      );
    } else {
      vscode.window.showWarningMessage(`WoClaw Hub unreachable at ${url}`);
    }
  });
}

export function deactivate() {
  if (pollTimer) clearInterval(pollTimer);
  statusBarItem?.dispose();
}
