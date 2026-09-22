import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(root, 'data');

function file(name) {
  return path.join(dir, name);
}

function read(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch {
    return fallback;
  }
}

let timer = null;
const dirty = new Set();
const cache = {
  accounts: read('accounts.json', {}),
  reports: read('reports.json', []),
  audit: read('audit.json', []),
};

function flush() {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of dirty) {
    const key = name.replace('.json', '');
    fs.writeFileSync(file(name), JSON.stringify(cache[key], null, 2));
  }
  dirty.clear();
  timer = null;
}

function mark(name) {
  dirty.add(name);
  if (!timer) timer = setTimeout(flush, 250);
}

export function accountFor(token, name) {
  const id = String(token || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 48);
  const key = id || `anon${Date.now().toString(36)}`;
  if (!cache.accounts[key]) {
    cache.accounts[key] = {
      token: key,
      name: name || 'Rookie',
      created: Date.now(),
      xp: 0,
      credits: 0,
      rating: 0,
      peak: 0,
      matches: 0,
      wins: 0,
      elims: 0,
      obj: 0,
      placementsLeft: 5,
      abandons: [],
      banUntil: 0,
      mutedUntil: 0,
      flags: 0,
    };
  }
  if (name) cache.accounts[key].name = name;
  mark('accounts.json');
  return cache.accounts[key];
}

export function saveAccount(account) {
  if (!account?.token) return;
  cache.accounts[account.token] = account;
  mark('accounts.json');
}

export function noteAbandon(account) {
  const now = Date.now();
  account.abandons = (account.abandons || []).filter((t) => now - t < 3600000);
  account.abandons.push(now);
  if (account.abandons.length >= 3) account.banUntil = now + 10 * 60 * 1000;
  saveAccount(account);
  return account;
}

export function addReport(entry) {
  const row = { id: `r${Date.now().toString(36)}`, status: 'open', at: Date.now(), ...entry };
  cache.reports.unshift(row);
  cache.reports = cache.reports.slice(0, 200);
  mark('reports.json');
  return row;
}

export function listReports() {
  return cache.reports.filter((r) => r.status === 'open').slice(0, 80);
}

export function listAudit() {
  return cache.audit.slice(0, 40);
}

export function closeReport(id, action) {
  const row = cache.reports.find((r) => r.id === id);
  if (row) row.status = action || 'closed';
  mark('reports.json');
  return row;
}

export function audit(action, detail) {
  cache.audit.unshift({ at: Date.now(), action, detail: String(detail || '').slice(0, 180) });
  cache.audit = cache.audit.slice(0, 200);
  mark('audit.json');
}

export function leaderboard(board = 'rating') {
  const key = board === 'wins' ? 'wins' : board === 'elims' ? 'elims' : board === 'obj' ? 'obj' : 'rating';
  return Object.values(cache.accounts)
    .map((a) => ({ name: a.name, value: a[key] || 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 20);
}

export function findAccountByName(name) {
  const needle = String(name || '').toLowerCase();
  return Object.values(cache.accounts).find((a) => a.name.toLowerCase() === needle) || null;
}

export function allAccounts() {
  return Object.values(cache.accounts);
}
