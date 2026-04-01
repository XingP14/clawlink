#!/usr/bin/env node
/**
 * WoClaw Hooks Installer
 * Multi-framework shared memory hooks for Claude Code, Gemini CLI, OpenCode
 *
 * Usage:
 *   npx woclaw-hooks --framework claude-code   # Install Claude Code hooks
 *   npx woclaw-hooks --framework gemini       # Install Gemini CLI hooks
 *   npx woclaw-hooks --framework opencode     # Install OpenCode hooks
 *   npx woclaw-hooks --uninstall --framework claude-code
 *   npx woclaw-hooks --status                 # Show installed hooks
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOOKS_SOURCE = __dirname;
const ENV_FILE = path.join(os.homedir(), '.woclaw', '.env');

const SUPPORTED_FRAMEWORKS = ['claude-code', 'gemini', 'opencode'];

const FRAMEWORK_CONFIG = {
  'claude-code': {
    hooksDir: path.join(os.homedir(), '.claude', 'hooks'),
    settingsFile: path.join(os.homedir(), '.claude', 'settings.json'),
    hookNames: ['session-start', 'session-stop', 'precompact'],
    hookPrefix: 'woclaw-',
    settingsHint: `{ "hooks": { "onEnter": ["bash ~/.claude/hooks/woclaw-session-start.sh"] } }`,
  },
  'gemini': {
    hooksDir: path.join(os.homedir(), '.gemini', 'hooks'),
    settingsFile: path.join(os.homedir(), '.gemini', 'settings.json'),
    hookNames: ['session-start', 'session-stop'],
    hookPrefix: 'woclaw-',
    settingsHint: `# Add to your ~/.gemini/env or shell profile:
export WOCLAW_HUB_URL="http://vm153:8083"
export WOCLAW_TOKEN="ClawLink2026"
export WOCLAW_PROJECT_KEY="project:context"`,
  },
  'opencode': {
    hooksDir: path.join(os.homedir(), '.opencode', 'hooks'),
    settingsFile: path.join(os.homedir(), '.opencode', 'config.json'),
    hookNames: ['session-start', 'session-stop'],
    hookPrefix: 'woclaw-',
    settingsHint: `# OpenCode hooks directory: ~/.opencode/hooks/`,
  },
};

const DEFAULT_CONFIG = {
  WOCLAW_HUB_URL: process.env.WOCLAW_HUB_URL || 'http://vm153:8083',
  WOCLAW_TOKEN: process.env.WOCLAW_TOKEN || 'WoClaw2026', // Note: REST API still uses WoClaw2026 until Hub restart
  WOCLAW_PROJECT_KEY: process.env.WOCLAW_PROJECT_KEY || 'project:context',
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readLine(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    process.stdin.once('data', (d) => {
      resolve(d.toString().trim());
    });
  });
}

async function interactiveConfig(existing) {
  console.log('\n🔧 WoClaw Hub Configuration\n');
  const hubUrl = await readLine(`Hub URL [${existing.WOCLAW_HUB_URL}]: `) || existing.WOCLAW_HUB_URL;
  const token = await readLine(`Hub Token [${existing.WOCLAW_TOKEN}]: `) || existing.WOCLAW_TOKEN;
  const projectKey = await readLine(`Project Key [${existing.WOCLAW_PROJECT_KEY}]: `) || existing.WOCLAW_PROJECT_KEY;
  return { WOCLAW_HUB_URL: hubUrl, WOCLAW_TOKEN: token, WOCLAW_PROJECT_KEY: projectKey };
}

function loadExistingConfig() {
  if (fs.existsSync(ENV_FILE)) {
    const content = fs.readFileSync(ENV_FILE, 'utf8');
    const config = {};
    for (const line of content.split('\n')) {
      const m = line.match(/^([^="#]+)="?([^"]*)"?/);
      if (m) config[m[1].trim()] = m[2].trim();
    }
    return { ...DEFAULT_CONFIG, ...config };
  }
  return DEFAULT_CONFIG;
}

function saveConfig(config) {
  ensureDir(path.dirname(ENV_FILE));
  const envContent = Object.entries(config)
    .map(([k, v]) => `${k}="${v}"`)
    .join('\n') + '\n';
  fs.writeFileSync(ENV_FILE, envContent);
}

function installHooks(framework, config) {
  const fw = FRAMEWORK_CONFIG[framework];
  if (!fw) { console.error(`Unknown framework: ${framework}`); process.exit(1); }

  ensureDir(fw.hooksDir);

  const installed = [];
  const missing = [];

  for (const hook of fw.hookNames) {
    const src = path.join(HOOKS_SOURCE, `${hook}.sh`);
    const dst = path.join(fw.hooksDir, `${fw.hookPrefix}${hook}.sh`);

    if (fs.existsSync(src)) {
      // Substitute env vars in hook script
      let content = fs.readFileSync(src, 'utf8');
      content = content.replace(/\$\{WOCLAW_HUB_URL[^}]*\}/g, config.WOCLAW_HUB_URL);
      content = content.replace(/\$WOCLAW_HUB_URL\b/g, config.WOCLAW_HUB_URL);
      content = content.replace(/\$WOCLAW_TOKEN\b/g, config.WOCLAW_TOKEN);
      content = content.replace(/\$WOCLAW_PROJECT_KEY\b/g, config.WOCLAW_PROJECT_KEY);
      fs.writeFileSync(dst, content);
      fs.chmodSync(dst, 0o755);
      installed.push(path.basename(dst));
    } else {
      missing.push(`${hook}.sh`);
    }
  }

  if (installed.length) console.log(`✅ Installed (${framework}): ${installed.join(', ')}`);
  if (missing.length) console.log(`⚠️  Missing hooks: ${missing.join(', ')}`);

  saveConfig(config);

  console.log(`\n✅ Config written to: ${ENV_FILE}`);
  console.log('\n📝 Add to your ' + framework + ' config:');
  console.log('   ' + fw.settingsHint.replace(/\n/g, '\n   '));
  console.log('\n💡 Restart your ' + framework + ' session for hooks to take effect.');
}

function uninstallHooks(framework) {
  const fw = FRAMEWORK_CONFIG[framework];
  if (!fw) { console.error(`Unknown framework: ${framework}`); process.exit(1); }

  for (const hook of fw.hookNames) {
    const dst = path.join(fw.hooksDir, `${fw.hookPrefix}${hook}.sh`);
    if (fs.existsSync(dst)) {
      fs.unlinkSync(dst);
      console.log(`🗑️  Removed: ${path.basename(dst)}`);
    }
  }
  console.log(`\n✅ Uninstalled ${framework} hooks. Config preserved at ${ENV_FILE}.`);
}

function showStatus() {
  const config = loadExistingConfig();
  console.log('\n📡 WoClaw Hooks Status\n');
  console.log(`   Hub URL:     ${config.WOCLAW_HUB_URL}`);
  console.log(`   Token:       ${config.WOCLAW_TOKEN ? '***' + config.WOCLAW_TOKEN.slice(-4) : '(not set)'}`);
  console.log(`   Project Key: ${config.WOCLAW_PROJECT_KEY}`);

  for (const [fw, cfg] of Object.entries(FRAMEWORK_CONFIG)) {
    const installed = cfg.hookNames.filter(h =>
      fs.existsSync(path.join(cfg.hooksDir, `${cfg.hookPrefix}${h}.sh`))
    );
    const status = installed.length === cfg.hookNames.length ? '✅' : installed.length ? '⚠️' : '❌';
    console.log(`\n   ${status} ${fw}: ${installed.length}/${cfg.hookNames.length} hooks installed`);
    if (installed.length > 0) {
      for (const h of installed) console.log(`      - ${cfg.hookPrefix}${h}.sh`);
    }
  }
  console.log();
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--status') || args.includes('status')) {
    showStatus();
    return;
  }

  // Parse --framework
  let framework = null;
  for (const fw of SUPPORTED_FRAMEWORKS) {
    if (args.includes('--framework') || args.includes('--' + fw)) {
      const idx = args.indexOf('--framework');
      framework = args[idx + 1] || fw;
      break;
    }
  }

  // Parse action
  const uninstall = args.includes('--uninstall');
  const install = args.includes('--install');

  if (!framework) {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║        WoClaw Hooks Installer  v0.4.0           ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('\nUsage: npx woclaw-hooks [options]');
    console.log('\nOptions:');
    console.log('  --framework claude-code   Install for Claude Code');
    console.log('  --framework gemini         Install for Gemini CLI');
    console.log('  --framework opencode       Install for OpenCode');
    console.log('  --install                  Non-interactive install');
    console.log('  --uninstall                Remove hooks');
    console.log('  --status                   Show hook status');
    console.log('\nExamples:');
    console.log('  npx woclaw-hooks --framework claude-code');
    console.log('  npx woclaw-hooks --framework gemini --install');
    console.log('  npx woclaw-hooks --status');
    console.log('\nSupported frameworks: ' + SUPPORTED_FRAMEWORKS.join(', '));
    console.log();
    return;
  }

  if (!SUPPORTED_FRAMEWORKS.includes(framework)) {
    console.error(`Unknown framework: ${framework}`);
    console.error('Supported: ' + SUPPORTED_FRAMEWORKS.join(', '));
    process.exit(1);
  }

  if (uninstall) {
    uninstallHooks(framework);
    return;
  }

  const config = install
    ? loadExistingConfig()
    : await interactiveConfig(loadExistingConfig());

  installHooks(framework, config);
  console.log('\n🎉 Done!');
}

main().catch(console.error);
