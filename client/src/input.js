const GAMEPAD = {
  jump: 0,
  melee: 1,
  reload: 2,
  tactical: 3,
  dodge: 4,
  ultimate: 5,
  aim: 6,
  fire: 7,
  pause: 9,
  sprint: 10,
  shoulder: 11,
  crouch: 13,
};

export class Input {
  constructor() {
    this.keys = new Set();
    this.mouse = { dx: 0, dy: 0, l: false, r: false, wheel: 0, downL: false, downR: false };
    this.locked = false;
    this.bindings = {};
    this.rebind = null;
    this.pad = { active: false, moveX: 0, moveY: 0, lookX: 0, lookY: 0, buttons: {} };
    this.prevPad = {};
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('mousedown', (e) => this.onMouseButton(e, true));
    window.addEventListener('mouseup', (e) => this.onMouseButton(e, false));
    window.addEventListener('mousemove', (e) => {
      if (this.locked || e.buttons) {
        this.mouse.dx += e.movementX || 0;
        this.mouse.dy += e.movementY || 0;
      }
    });
    window.addEventListener('wheel', (e) => {
      this.mouse.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.keys.clear();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement != null;
    });
  }

  setBindings(bindings) {
    this.bindings = bindings;
    this.boundCodes = new Set(Object.values(bindings || {}).filter((c) => !String(c).startsWith('Mouse')));
  }

  onKey(e, down) {
    if (this.rebind && down) {
      e.preventDefault();
      const code = e.code;
      const done = this.rebind;
      this.rebind = null;
      done(code);
      return;
    }
    if (down) this.keys.add(e.code);
    else this.keys.delete(e.code);
    // While playing, game keys must not scroll the page, move focus, or trigger browser shortcuts.
    if (this.capture && this.boundCodes?.has(e.code)) e.preventDefault();
  }

  onMouseButton(e, down) {
    if (this.rebind && down) {
      const done = this.rebind;
      this.rebind = null;
      done(e.button === 2 ? 'Mouse2' : e.button === 1 ? 'Mouse1' : 'Mouse0');
      e.preventDefault();
      return;
    }
    if (!this.locked && e.target instanceof Element && e.target.closest('#ui')) {
      if (!down) {
        if (e.button === 0) this.mouse.l = false;
        if (e.button === 2) this.mouse.r = false;
      }
      return;
    }
    if (e.button === 0) this.mouse.l = down;
    if (e.button === 2) this.mouse.r = down;
    if (down && e.button === 0) this.mouse.downL = true;
    if (down && e.button === 2) this.mouse.downR = true;
  }

  held(action) {
    const code = this.bindings[action];
    if (!code) return false;
    if (code === 'Mouse0') return this.mouse.l;
    if (code === 'Mouse2') return this.mouse.r;
    if (code === 'Mouse1') return false;
    return this.keys.has(code);
  }

  consumeLook() {
    const d = { x: this.mouse.dx, y: this.mouse.dy, wheel: this.mouse.wheel };
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.wheel = 0;
    return d;
  }

  pollPad(settings) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && (pads[0] || pads[1]);
    if (!gp || !gp.connected) {
      // A disconnected pad must not keep feeding its last axis values (the classic
      // "character keeps strafing after the controller drops" bug).
      if (this.pad.active || this.pad.moveX || this.pad.moveY || this.pad.lookX || this.pad.lookY || Object.keys(this.pad.buttons).length) {
        this.pad.active = false;
        this.pad.moveX = 0;
        this.pad.moveY = 0;
        this.pad.lookX = 0;
        this.pad.lookY = 0;
        this.pad.buttons = {};
      }
      return;
    }
    this.pad.active = true;
    const dz = settings.deadzone ?? 0.16;
    const ax = (v) => (Math.abs(v) < dz ? 0 : v);
    this.pad.moveX = ax(gp.axes[0] || 0);
    this.pad.moveY = ax(-(gp.axes[1] || 0));
    let lx = ax(gp.axes[2] || 0);
    let ly = ax(gp.axes[3] || 0);
    const accel = settings.lookAccel ?? 1;
    const sens = (settings.controllerSens ?? 2.2) * 0.04;
    if (accel > 1) {
      lx *= Math.abs(lx) * (accel - 1) + 1;
      ly *= Math.abs(ly) * (accel - 1) + 1;
    }
    this.pad.lookX = lx * sens;
    this.pad.lookY = ly * sens;
    this.pad.buttons = {};
    gp.buttons.forEach((b, i) => { this.pad.buttons[i] = b.pressed || b.value > 0.45; });
  }

  padDown(name) {
    const i = GAMEPAD[name];
    return !!(this.pad.active && this.pad.buttons[i]);
  }

  padEdge(name) {
    const i = GAMEPAD[name];
    const now = !!(this.pad.active && this.pad.buttons[i]);
    const prev = !!this.prevPad[i];
    return now && !prev;
  }

  endFrame() {
    this.mouse.downL = false;
    this.mouse.downR = false;
    this.prevPad = { ...(this.pad.buttons || {}) };
  }

  requestLock(el) {
    el?.requestPointerLock?.();
  }

  exitLock() {
    document.exitPointerLock?.();
  }
}

export function defaultBindings() {
  return {
    forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
    jump: 'Space', crouch: 'ControlLeft', sprint: 'ShiftLeft',
    fire: 'Mouse0', aim: 'Mouse2', reload: 'KeyR', melee: 'KeyV',
    tactical: 'KeyQ', ultimate: 'KeyZ', dodge: 'AltLeft', interact: 'KeyF',
    shoulder: 'KeyC', slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3',
    scoreboard: 'Tab', pause: 'Escape', chat: 'KeyT', drop: 'KeyG',
    lookLeft: 'ArrowLeft', lookRight: 'ArrowRight', lookUp: 'ArrowUp', lookDown: 'ArrowDown',
  };
}
