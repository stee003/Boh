/** Client relay. The dedicated server owns score, damage, and rewards for relay circuits. */

export class Relay {
  constructor(game) {
    this.game = game;
    this.ws = null;
    this.online = false;
    this.ping = 0;
    this.token = null;
    this.queue = [];
  }

  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    let sock;
    try { sock = new WebSocket(`${proto}://${location.host}/ws`); }
    catch { this.online = false; return; }
    this.ws = sock;
    sock.addEventListener('open', () => {
      this.online = true;
      sock.send(JSON.stringify({ type: 'hello', token: this.token, name: this.game.profile?.name, lang: this.game.i18n?.lang }));
      this.game.refreshNet?.();
    });
    sock.addEventListener('close', () => {
      this.online = false;
      if (this.game.relayLive) this.game.onRelayFault?.();
      this.game.refreshNet?.();
    });
    sock.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      this.game.onRelay?.(msg);
    });
    sock.addEventListener('error', () => { this.online = false; });
  }

  send(msg) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  pulse() {
    this.send({ type: 'ping', t: Date.now() });
  }
}
