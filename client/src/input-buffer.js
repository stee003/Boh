// Preserve short presses between render frames, simulation ticks and relay sends.
const PULSES = ['fire', 'jump', 'reload', 'melee', 'dodge', 'tactical', 'ultimate', 'interact', 'drop', 'shoulderTap'];
export function bufferInput(pending, next) {
  if (!pending) return { ...next };
  const merged = { ...next };
  for (const key of PULSES) merged[key] = !!(pending[key] || next[key]);
  if (next.weaponSlot < 0) merged.weaponSlot = pending.weaponSlot;
  return merged;
}
