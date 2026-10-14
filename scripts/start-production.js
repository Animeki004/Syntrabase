#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const isWindows = process.platform === 'win32';
const npxCmd = isWindows ? 'npx.cmd' : 'npx';

console.log('\n========================================================');
console.log('  SYNTRABASE PRODUCTION CLUSTER LAUNCHER');
console.log('========================================================\n');

const services = [
  {
    name: 'API GATEWAY',
    port: 4000,
    cmd: 'node',
    args: ['apps/api/dist/apps/api/src/server.js'],
    cwd: rootDir,
    color: '\x1b[36m', // Cyan
  },
  {
    name: 'CONSOLE',
    port: 3000,
    cmd: npxCmd,
    args: ['next', 'start', 'apps/console', '-p', '3000'],
    cwd: rootDir,
    color: '\x1b[32m', // Green
  },
  {
    name: 'SUPER ADMIN',
    port: 3001,
    cmd: npxCmd,
    args: ['next', 'start', 'apps/super-admin', '-p', '3001'],
    cwd: rootDir,
    color: '\x1b[35m', // Magenta
  },
];

const runningProcesses = [];

function prefixOutput(prefix, color, stream, data) {
  const reset = '\x1b[0m';
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.trim().length > 0) {
      stream.write(`${color}[${prefix}]${reset} ${line}\n`);
    }
  }
}

for (const svc of services) {
  console.log(`Starting ${svc.name} (Production) on port ${svc.port}...`);
  const child = spawn(svc.cmd, svc.args, {
    cwd: svc.cwd,
    env: { ...process.env, PORT: svc.port.toString() },
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: isWindows,
  });

  child.stdout.on('data', (d) => prefixOutput(svc.name, svc.color, process.stdout, d));
  child.stderr.on('data', (d) => prefixOutput(svc.name, svc.color, process.stderr, d));

  child.on('error', (err) => {
    console.error(`\x1b[31m[${svc.name}] Failed to start:\x1b[0m`, err);
  });

  child.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.warn(`[${svc.name}] Process exited with code ${code}`);
    }
  });

  runningProcesses.push(child);
}

function shutdown() {
  console.log('\nShutting down Syntrabase production cluster...');
  for (const child of runningProcesses) {
    try {
      if (isWindows && child.pid) {
        spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t']);
      } else {
        child.kill('SIGTERM');
      }
    } catch {}
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
