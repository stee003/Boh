import { ATTACHMENTS } from './constants.js';

function pattern(n, pitch, yawAmp, freq, bias = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const ramp = 0.72 + 0.28 * Math.min(1, i / 5);
    const p = pitch * ramp * (1 + 0.08 * Math.sin(i * 0.85));
    const y = Math.sin(i * freq) * yawAmp + bias * i * 0.012;
    out.push([Math.round(p * 1000) / 1000, Math.round(y * 1000) / 1000]);
  }
  return out;
}

/**
 * damage is per bullet (or per pellet).
 * fireRate is rounds per second (bursts use cycle + burstInterval).
 * recoil values are degrees of camera kick per shot — deterministic, learnable.
 */
const LIST = [
  {
    id: 'linecut', nameKey: 'weapon.linecut.name', descKey: 'weapon.linecut.desc',
    category: 'ar', slot: 'primary', damage: 18, headMul: 1.85, limbMul: 0.82,
    fireMode: 'auto', fireRate: 9.1, mag: 30, reserve: 120, reload: 1.82, reloadEmpty: 2.15,
    spread: { hip: 0.022, ads: 0.0035, move: 0.016, air: 0.034, slide: 0.014 },
    recoil: pattern(28, 0.62, 0.16, 0.72, 0.4), recoilRecovery: 11, heat: 0.0012,
    range: 46, falloffStart: 20, falloff: 0.66, mobility: 0.96, adsTime: 0.18, sprintToFire: 0.14,
    pellets: 1, projectile: false, rarity: 'standard',
    attachments: ['barrel', 'optic', 'mag', 'stock'],
    visual: { color: '#9eb0c2', accent: '#5cffd6', barrel: 0.52, mag: 'straight', stock: true, optic: 'holo' },
    sound: 'ar',
  },
  {
    id: 'ashford', nameKey: 'weapon.ashford.name', descKey: 'weapon.ashford.desc',
    category: 'ar', slot: 'primary', damage: 26, headMul: 1.75, limbMul: 0.8,
    fireMode: 'auto', fireRate: 6.0, mag: 24, reserve: 96, reload: 2.05, reloadEmpty: 2.35,
    spread: { hip: 0.02, ads: 0.003, move: 0.014, air: 0.03, slide: 0.012 },
    recoil: pattern(22, 0.95, 0.28, 0.55, -0.6), recoilRecovery: 8.5, heat: 0.0016,
    range: 50, falloffStart: 24, falloff: 0.72, mobility: 0.92, adsTime: 0.22, sprintToFire: 0.18,
    pellets: 1, projectile: false, rarity: 'standard',
    attachments: ['barrel', 'optic', 'mag', 'stock'],
    visual: { color: '#c4b49a', accent: '#ffb03a', barrel: 0.62, mag: 'straight', stock: true, optic: 'iron' },
    sound: 'ar_heavy',
  },
  {
    id: 'cinderline', nameKey: 'weapon.cinderline.name', descKey: 'weapon.cinderline.desc',
    category: 'ar', slot: 'primary', damage: 14, headMul: 1.7, limbMul: 0.84,
    fireMode: 'auto', fireRate: 12.4, mag: 34, reserve: 136, reload: 1.7, reloadEmpty: 2.0,
    spread: { hip: 0.028, ads: 0.006, move: 0.02, air: 0.04, slide: 0.018 },
    recoil: pattern(30, 0.48, 0.22, 0.9, 0.8), recoilRecovery: 13, heat: 0.002,
    range: 32, falloffStart: 14, falloff: 0.48, mobility: 1.0, adsTime: 0.15, sprintToFire: 0.1,
    pellets: 1, projectile: false, rarity: 'standard',
    attachments: ['barrel', 'optic', 'mag', 'stock'],
    visual: { color: '#d0d4dc', accent: '#ff5a3c', barrel: 0.4, mag: 'straight', stock: false, optic: 'holo' },
    sound: 'ar_fast',
  },
  {
    id: 'bastionk', nameKey: 'weapon.bastionk.name', descKey: 'weapon.bastionk.desc',
    category: 'ar', slot: 'primary', damage: 21, headMul: 1.8, limbMul: 0.8,
    fireMode: 'auto', fireRate: 6.7, mag: 28, reserve: 112, reload: 2.1, reloadEmpty: 2.4,
    spread: { hip: 0.016, ads: 0.0022, move: 0.012, air: 0.028, slide: 0.01 },
    recoil: pattern(24, 0.42, 0.08, 0.4, 0.15), recoilRecovery: 10, heat: 0.0008,
    range: 58, falloffStart: 28, falloff: 0.8, mobility: 0.9, adsTime: 0.26, sprintToFire: 0.2,
    pellets: 1, projectile: false, rarity: 'standard',
    attachments: ['barrel', 'optic', 'mag', 'stock'],
    visual: { color: '#8d97a3', accent: '#2ec8ff', barrel: 0.7, mag: 'straight', stock: true, optic: 'scope' },
    sound: 'ar',
  },
  {
    id: 'kestrel', nameKey: 'weapon.kestrel.name', descKey: 'weapon.kestrel.desc',
    category: 'smg', slot: 'primary', damage: 13, headMul: 1.55, limbMul: 0.86,
    fireMode: 'auto', fireRate: 14, mag: 32, reserve: 128, reload: 1.45, reloadEmpty: 1.7,
    spread: { hip: 0.03, ads: 0.008, move: 0.012, air: 0.036, slide: 0.016 },
    recoil: pattern(28, 0.4, 0.2, 1.1, 0.5), recoilRecovery: 14, heat: 0.0022,
    range: 24, falloffStart: 10, falloff: 0.42, mobility: 1.04, adsTime: 0.12, sprintToFire: 0.08,
    pellets: 1, projectile: false, rarity: 'standard',
    attachments: ['barrel', 'optic', 'mag', 'stock'],
    visual: { color: '#d5dde6', accent: '#7af0ff', barrel: 0.28, mag: 'straight', stock: false, optic: 'holo' },
    sound: 'smg',
  },
  {
    id: 'ripcord', nameKey: 'weapon.ripcord.name', descKey: 'weapon.ripcord.desc',
    category: 'smg', slot: 'primary', damage: 11, headMul: 1.45, limbMul: 0.88,
    fireMode: 'auto', fireRate: 16.8, mag: 36, reserve: 144, reload: 1.55, reloadEmpty: 1.85,
    spread: { hip: 0.042, ads: 0.014, move: 0.016, air: 0.046, slide: 0.02 },
    recoil: pattern(30, 0.36, 0.3, 1.3, -0.4), recoilRecovery: 15, heat: 0.0028,
    range: 16, falloffStart: 7, falloff: 0.32, mobility: 1.06, adsTime: 0.1, sprintToFire: 0.06,
    pellets: 1, projectile: false, rarity: 'standard',
    attachments: ['barrel', 'mag', 'stock'],
    visual: { color: '#f0f2f4', accent: '#ff4d6a', barrel: 0.18, mag: 'straight', stock: false, optic: 'iron' },
    sound: 'smg_fast',
  },
  {
    id: 'velvet', nameKey: 'weapon.velvet.name', descKey: 'weapon.velvet.desc',
    category: 'smg', slot: 'primary', damage: 16, headMul: 1.6, limbMul: 0.84,
    fireMode: 'auto', fireRate: 10.4, mag: 28, reserve: 112, reload: 1.5, reloadEmpty: 1.75,
    spread: { hip: 0.02, ads: 0.004, move: 0.012, air: 0.03, slide: 0.012 },
    recoil: pattern(24, 0.5, 0.12, 0.66, 0.2), recoilRecovery: 12, heat: 0.0014,
    range: 32, falloffStart: 14, falloff: 0.58, mobility: 1.01, adsTime: 0.14, sprintToFire: 0.1,
    pellets: 1, projectile: false, rarity: 'standard',
    attachments: ['barrel', 'optic', 'mag', 'stock'],
    visual: { color: '#b9a8c9', accent: '#e4c2ff', barrel: 0.36, mag: 'straight', stock: true, optic: 'holo' },
    sound: 'smg',
  },
  {
    id: 'needleburst', nameKey: 'weapon.needleburst.name', descKey: 'weapon.needleburst.desc',
    category: 'smg', slot: 'primary', damage: 15, headMul: 1.65, limbMul: 0.84,
    fireMode: 'burst', fireRate: 3.1, burst: 3, burstInterval: 0.045, mag: 30, reserve: 120,
    reload: 1.55, reloadEmpty: 1.8,
    spread: { hip: 0.018, ads: 0.003, move: 0.01, air: 0.026, slide: 0.01 },
    recoil: pattern(18, 0.46, 0.1, 0.8, 0.1), recoilRecovery: 12, heat: 0.0006,
    range: 30, falloffStart: 13, falloff: 0.55, mobility: 1.02, adsTime: 0.13, sprintToFire: 0.09,
    pellets: 1, projectile: false, rarity: 'standard',
    attachments: ['barrel', 'optic', 'mag', 'stock'],
    visual: { color: '#cfd6df', accent: '#9ad7ff', barrel: 0.34, mag: 'straight', stock: false, optic: 'holo' },
    sound: 'smg',
  },
  {
    id: 'hammerfall', nameKey: 'weapon.hammerfall.name', descKey: 'weapon.hammerfall.desc',
    category: 'shotgun', slot: 'primary', damage: 13, headMul: 1.25, limbMul: 0.9,
    fireMode: 'semi', fireRate: 1.05, mag: 6, reserve: 30, reload: 0.55, reloadEmpty: 0.62, shellReload: true,
    spread: { hip: 0.085, ads: 0.055, move: 0.02, air: 0.04, slide: 0.02 },
    recoil: pattern(8, 2.4, 0.2, 0.4, 0), recoilRecovery: 7, heat: 0,
    range: 14, falloffStart: 6, falloff: 0.28, mobility: 0.94, adsTime: 0.2, sprintToFire: 0.16,
    pellets: 8, projectile: false, rarity: 'standard',
    attachments: ['barrel', 'stock'],
    visual: { color: '#8a6a52', accent: '#ffb03a', barrel: 0.48, mag: 'none', stock: true, optic: 'iron' },
    sound: 'shotgun',
  },
  {
    id: 'scatterwake', nameKey: 'weapon.scatterwake.name', descKey: 'weapon.scatterwake.desc',
    category: 'shotgun', slot: 'primary', damage: 9, headMul: 1.2, limbMul: 0.92,
    fireMode: 'semi', fireRate: 2.35, mag: 8, reserve: 40, reload: 1.9, reloadEmpty: 2.1,
    spread: { hip: 0.11, ads: 0.078, move: 0.02, air: 0.04, slide: 0.024 },
    recoil: pattern(8, 1.5, 0.25, 0.5, 0), recoilRecovery: 9, heat: 0,
    range: 12, falloffStart: 5, falloff: 0.25, mobility: 1.0, adsTime: 0.16, sprintToFire: 0.1,
    pellets: 7, projectile: false, rarity: 'standard',
    attachments: ['barrel', 'mag'],
    visual: { color: '#6e7c86', accent: '#ff8a5a', barrel: 0.32, mag: 'drum', stock: false, optic: 'iron' },
    sound: 'shotgun',
  },
  {
    id: 'breachjaw', nameKey: 'weapon.breachjaw.name', descKey: 'weapon.breachjaw.desc',
    category: 'shotgun', slot: 'primary', damage: 72, headMul: 1.55, limbMul: 0.85,
    fireMode: 'semi', fireRate: 1.15, mag: 5, reserve: 25, reload: 2.2, reloadEmpty: 2.4,
    spread: { hip: 0.012, ads: 0.002, move: 0.01, air: 0.02, slide: 0.008 },
    recoil: pattern(6, 2.8, 0.05, 0.2, 0), recoilRecovery: 6, heat: 0,
    range: 28, falloffStart: 12, falloff: 0.62, mobility: 0.9, adsTime: 0.24, sprintToFire: 0.2,
    pellets: 1, projectile: false, rarity: 'standard',
    attachments: ['barrel', 'optic', 'stock'],
    visual: { color: '#4d5560', accent: '#ff5a3c', barrel: 0.66, mag: 'none', stock: true, optic: 'iron' },
    sound: 'shotgun_slug',
  },
  {
    id: 'glassline', nameKey: 'weapon.glassline.name', descKey: 'weapon.glassline.desc',
    category: 'sniper', slot: 'primary', damage: 80, headMul: 1.62, limbMul: 0.78,
    fireMode: 'semi', fireRate: 0.78, mag: 5, reserve: 20, reload: 2.6, reloadEmpty: 2.9,
    spread: { hip: 0.02, ads: 0.0004, move: 0.03, air: 0.05, slide: 0.02 },
    recoil: pattern(5, 3.6, 0.04, 0.2, 0), recoilRecovery: 5, heat: 0,
    range: 90, falloffStart: 55, falloff: 0.9, mobility: 0.82, adsTime: 0.32, sprintToFire: 0.28,
    zoom: 1.55, pellets: 1, projectile: false, rarity: 'standard',
    attachments: ['barrel', 'optic', 'stock'],
    visual: { color: '#d5dde8', accent: '#b9f3ff', barrel: 0.86, mag: 'straight', stock: true, optic: 'scope' },
    sound: 'sniper',
  },
  {
    id: 'quietmeridian', nameKey: 'weapon.quietmeridian.name', descKey: 'weapon.quietmeridian.desc',
    category: 'sniper', slot: 'primary', damage: 68, headMul: 1.52, limbMul: 0.8,
    fireMode: 'semi', fireRate: 1.15, mag: 8, reserve: 32, reload: 2.15, reloadEmpty: 2.4,
    spread: { hip: 0.014, ads: 0.0008, move: 0.02, air: 0.04, slide: 0.016 },
    recoil: pattern(6, 2.2, 0.06, 0.3, 0), recoilRecovery: 7, heat: 0,
    range: 72, falloffStart: 40, falloff: 0.82, mobility: 0.9, adsTime: 0.24, sprintToFire: 0.18,
    zoom: 1.28, pellets: 1, projectile: false, quiet: true, rarity: 'standard',
    attachments: ['barrel', 'optic', 'mag', 'stock'],
    visual: { color: '#3e4654', accent: '#9ad7ff', barrel: 0.7, mag: 'straight', stock: true, optic: 'scope' },
    sound: 'sniper_quiet',
  },
  {
    id: 'longbow', nameKey: 'weapon.longbow.name', descKey: 'weapon.longbow.desc',
    category: 'marksman', slot: 'primary', damage: 34, headMul: 1.82, limbMul: 0.8,
    fireMode: 'semi', fireRate: 3.3, mag: 12, reserve: 48, reload: 1.9, reloadEmpty: 2.15,
    spread: { hip: 0.012, ads: 0.0012, move: 0.012, air: 0.028, slide: 0.01 },
    recoil: pattern(12, 1.15, 0.1, 0.45, 0.1), recoilRecovery: 9, heat: 0.0004,
    range: 64, falloffStart: 30, falloff: 0.78, mobility: 0.94, adsTime: 0.2, sprintToFire: 0.14,
    zoom: 1.18, pellets: 1, projectile: false, rarity: 'standard',
    attachments: ['barrel', 'optic', 'mag', 'stock'],
    visual: { color: '#8d7b62', accent: '#ffd27a', barrel: 0.64, mag: 'straight', stock: true, optic: 'scope' },
    sound: 'marksman',
  },
  {
    id: 'arcstitch', nameKey: 'weapon.arcstitch.name', descKey: 'weapon.arcstitch.desc',
    category: 'marksman', slot: 'primary', damage: 22, headMul: 1.7, limbMul: 0.82,
    fireMode: 'burst', fireRate: 2.5, burst: 2, burstInterval: 0.07, mag: 16, reserve: 64,
    reload: 1.85, reloadEmpty: 2.05,
    spread: { hip: 0.014, ads: 0.002, move: 0.01, air: 0.026, slide: 0.01 },
    recoil: pattern(12, 0.7, 0.08, 0.6, 0), recoilRecovery: 10, heat: 0,
    range: 52, falloffStart: 24, falloff: 0.7, mobility: 0.97, adsTime: 0.16, sprintToFire: 0.12,
    pellets: 1, projectile: false, rarity: 'refined',
    attachments: ['barrel', 'optic', 'mag'],
    visual: { color: '#6a7c92', accent: '#5cffd6', barrel: 0.5, mag: 'cell', stock: false, optic: 'holo', glow: true },
    sound: 'energy',
  },
  {
    id: 'furnace', nameKey: 'weapon.furnace.name', descKey: 'weapon.furnace.desc',
    category: 'lmg', slot: 'primary', damage: 16, headMul: 1.5, limbMul: 0.84,
    fireMode: 'auto', fireRate: 10.2, mag: 75, reserve: 150, reload: 3.35, reloadEmpty: 3.6,
    spread: { hip: 0.028, ads: 0.007, move: 0.02, air: 0.05, slide: 0.02 },
    recoil: pattern(40, 0.5, 0.14, 0.5, 0.3), recoilRecovery: 8, heat: 0.0024,
    range: 48, falloffStart: 20, falloff: 0.7, mobility: 0.8, adsTime: 0.3, sprintToFire: 0.26,
    pellets: 1, projectile: false, rarity: 'standard',
    attachments: ['barrel', 'optic', 'mag', 'stock'],
    visual: { color: '#6a5348', accent: '#ff7a3c', barrel: 0.7, mag: 'drum', stock: true, optic: 'iron' },
    sound: 'lmg',
  },
  {
    id: 'drumline', nameKey: 'weapon.drumline.name', descKey: 'weapon.drumline.desc',
    category: 'lmg', slot: 'primary', damage: 14, headMul: 1.45, limbMul: 0.86,
    fireMode: 'auto', fireRate: 11.6, mag: 55, reserve: 165, reload: 2.75, reloadEmpty: 3.0,
    spread: { hip: 0.03, ads: 0.008, move: 0.016, air: 0.042, slide: 0.018 },
    recoil: pattern(36, 0.44, 0.18, 0.7, -0.2), recoilRecovery: 9, heat: 0.002,
    range: 40, falloffStart: 16, falloff: 0.6, mobility: 0.86, adsTime: 0.24, sprintToFire: 0.18,
    pellets: 1, projectile: false, rarity: 'standard',
    attachments: ['barrel', 'optic', 'mag', 'stock'],
    visual: { color: '#7d8794', accent: '#ffb03a', barrel: 0.48, mag: 'drum', stock: true, optic: 'holo' },
    sound: 'lmg',
  },
  {
    id: 'anchor', nameKey: 'weapon.anchor.name', descKey: 'weapon.anchor.desc',
    category: 'lmg', slot: 'primary', damage: 18, headMul: 1.48, limbMul: 0.82,
    fireMode: 'auto', fireRate: 7.8, mag: 48, reserve: 144, reload: 3.1, reloadEmpty: 3.4,
    spread: { hip: 0.02, ads: 0.004, move: 0.018, air: 0.046, slide: 0.016 },
    recoil: pattern(30, 0.38, 0.08, 0.35, 0.1), recoilRecovery: 8, heat: 0.0015,
    range: 54, falloffStart: 24, falloff: 0.76, mobility: 0.76, adsTime: 0.34, sprintToFire: 0.28,
    pellets: 1, projectile: false, rarity: 'standard',
    attachments: ['barrel', 'optic', 'stock'],
    visual: { color: '#3c4450', accent: '#8eb4ff', barrel: 0.78, mag: 'drum', stock: true, optic: 'scope' },
    sound: 'lmg',
  },
  {
    id: 'flick2', nameKey: 'weapon.flick2.name', descKey: 'weapon.flick2.desc',
    category: 'pistol', slot: 'secondary', damage: 22, headMul: 1.7, limbMul: 0.84,
    fireMode: 'semi', fireRate: 5.6, mag: 15, reserve: 60, reload: 1.25, reloadEmpty: 1.45,
    spread: { hip: 0.014, ads: 0.003, move: 0.008, air: 0.02, slide: 0.01 },
    recoil: pattern(12, 0.85, 0.12, 0.5, 0), recoilRecovery: 14, heat: 0,
    range: 32, falloffStart: 14, falloff: 0.6, mobility: 1.06, adsTime: 0.1, sprintToFire: 0.05,
    pellets: 1, projectile: false, rarity: 'standard',
    attachments: ['barrel', 'mag'],
    visual: { color: '#d0d5dc', accent: '#5cffd6', barrel: 0.16, mag: 'straight', stock: false, optic: 'iron' },
    sound: 'pistol',
  },
  {
    id: 'ironpetal', nameKey: 'weapon.ironpetal.name', descKey: 'weapon.ironpetal.desc',
    category: 'pistol', slot: 'secondary', damage: 34, headMul: 1.75, limbMul: 0.8,
    fireMode: 'semi', fireRate: 3.1, mag: 9, reserve: 36, reload: 1.45, reloadEmpty: 1.65,
    spread: { hip: 0.01, ads: 0.002, move: 0.008, air: 0.018, slide: 0.008 },
    recoil: pattern(8, 1.6, 0.08, 0.3, 0), recoilRecovery: 10, heat: 0,
    range: 36, falloffStart: 16, falloff: 0.7, mobility: 1.02, adsTime: 0.14, sprintToFire: 0.08,
    pellets: 1, projectile: false, rarity: 'standard',
    attachments: ['barrel', 'optic'],
    visual: { color: '#8a9098', accent: '#ffb0c4', barrel: 0.22, mag: 'straight', stock: false, optic: 'iron' },
    sound: 'pistol_heavy',
  },
  {
    id: 'sparkside', nameKey: 'weapon.sparkside.name', descKey: 'weapon.sparkside.desc',
    category: 'pistol', slot: 'secondary', damage: 11, headMul: 1.55, limbMul: 0.86,
    fireMode: 'burst', fireRate: 2.4, burst: 3, burstInterval: 0.04, mag: 18, reserve: 72,
    reload: 1.35, reloadEmpty: 1.55,
    spread: { hip: 0.016, ads: 0.004, move: 0.008, air: 0.02, slide: 0.01 },
    recoil: pattern(12, 0.55, 0.1, 0.9, 0), recoilRecovery: 13, heat: 0,
    range: 26, falloffStart: 12, falloff: 0.5, mobility: 1.04, adsTime: 0.11, sprintToFire: 0.06,
    pellets: 1, projectile: false, rarity: 'standard',
    attachments: ['barrel', 'mag'],
    visual: { color: '#c8ccd2', accent: '#ffe08a', barrel: 0.18, mag: 'straight', stock: false, optic: 'holo' },
    sound: 'pistol',
  },
  {
    id: 'helix', nameKey: 'weapon.helix.name', descKey: 'weapon.helix.desc',
    category: 'experimental', slot: 'primary', damage: 12, headMul: 1.75, limbMul: 0.84,
    fireMode: 'burst', fireRate: 2.05, burst: 4, burstInterval: 0.042, mag: 24, reserve: 96,
    reload: 1.8, reloadEmpty: 2.0,
    spread: { hip: 0.02, ads: 0.0024, move: 0.01, air: 0.024, slide: 0.01 },
    recoil: pattern(16, 0.42, 0.06, 0.55, 0), recoilRecovery: 11, heat: 0,
    range: 44, falloffStart: 18, falloff: 0.64, mobility: 0.98, adsTime: 0.16, sprintToFire: 0.12,
    pellets: 1, projectile: false, rarity: 'experimental',
    attachments: ['optic', 'mag', 'stock'],
    visual: { color: '#5c6d86', accent: '#5cffd6', barrel: 0.46, mag: 'cell', stock: false, optic: 'holo', glow: true },
    sound: 'energy',
  },
  {
    id: 'pulse7', nameKey: 'weapon.pulse7.name', descKey: 'weapon.pulse7.desc',
    category: 'experimental', slot: 'primary', damage: 16, headMul: 1.2, limbMul: 0.9,
    fireMode: 'semi', fireRate: 2.1, mag: 8, reserve: 32, reload: 1.7, reloadEmpty: 1.9,
    spread: { hip: 0.09, ads: 0.06, move: 0.02, air: 0.04, slide: 0.02 },
    recoil: pattern(6, 1.2, 0.1, 0.4, 0), recoilRecovery: 10, heat: 0,
    range: 14, falloffStart: 6, falloff: 0.22, mobility: 1.03, adsTime: 0.12, sprintToFire: 0.08,
    pellets: 5, projectile: false, rarity: 'experimental',
    attachments: ['barrel'],
    visual: { color: '#6a4e78', accent: '#d28bff', barrel: 0.22, mag: 'cell', stock: false, optic: 'iron', glow: true },
    sound: 'energy_blast',
  },
  {
    id: 'bankshot', nameKey: 'weapon.bankshot.name', descKey: 'weapon.bankshot.desc',
    category: 'experimental', slot: 'primary', damage: 40, headMul: 1.45, limbMul: 0.86,
    fireMode: 'semi', fireRate: 1.55, mag: 8, reserve: 32, reload: 1.9, reloadEmpty: 2.1,
    spread: { hip: 0.01, ads: 0.002, move: 0.006, air: 0.014, slide: 0.008 },
    recoil: pattern(6, 1.1, 0.05, 0.2, 0), recoilRecovery: 8, heat: 0,
    range: 40, falloffStart: 18, falloff: 0.85, mobility: 0.98, adsTime: 0.16, sprintToFire: 0.12,
    pellets: 1, projectile: true, projectileSpeed: 72, bounces: 1, gravity: 0, radius: 0.08,
    rarity: 'experimental',
    attachments: ['optic', 'stock'],
    visual: { color: '#d2b48a', accent: '#ffe08a', barrel: 0.4, mag: 'cell', stock: true, optic: 'holo', glow: true },
    sound: 'projectile',
  },
  {
    id: 'overcast', nameKey: 'weapon.overcast.name', descKey: 'weapon.overcast.desc',
    category: 'experimental', slot: 'primary', damage: 95, headMul: 1.35, limbMul: 0.9,
    fireMode: 'charge', fireRate: 0.9, chargeTime: 0.85, minCharge: 0.22, mag: 6, reserve: 24,
    reload: 2.1, reloadEmpty: 2.3,
    spread: { hip: 0.008, ads: 0.001, move: 0.006, air: 0.016, slide: 0.008 },
    recoil: pattern(4, 1.8, 0.04, 0.2, 0), recoilRecovery: 7, heat: 0,
    range: 48, falloffStart: 20, falloff: 0.8, mobility: 0.88, adsTime: 0.2, sprintToFire: 0.16,
    chargeSlow: 0.62, pellets: 1, projectile: true, projectileSpeed: 62, gravity: 4, radius: 0.12,
    rarity: 'experimental',
    attachments: ['optic', 'stock'],
    visual: { color: '#4a5568', accent: '#8eb4ff', barrel: 0.58, mag: 'cell', stock: true, optic: 'holo', glow: true },
    sound: 'charge',
  },
  {
    id: 'orbitlance', nameKey: 'weapon.orbitlance.name', descKey: 'weapon.orbitlance.desc',
    category: 'experimental', slot: 'primary', damage: 46, headMul: 1.55, limbMul: 0.84,
    fireMode: 'semi', fireRate: 1.25, mag: 8, reserve: 32, reload: 2.0, reloadEmpty: 2.2,
    spread: { hip: 0.008, ads: 0.001, move: 0.006, air: 0.014, slide: 0.006 },
    recoil: pattern(6, 1.3, 0.04, 0.2, 0), recoilRecovery: 8, heat: 0,
    range: 56, falloffStart: 24, falloff: 0.82, mobility: 0.94, adsTime: 0.2, sprintToFire: 0.14,
    pellets: 1, projectile: true, projectileSpeed: 96, pierce: 1, gravity: 2.2, radius: 0.07,
    rarity: 'experimental',
    attachments: ['barrel', 'optic'],
    visual: { color: '#8aa0b8', accent: '#7af0ff', barrel: 0.74, mag: 'cell', stock: false, optic: 'scope', glow: true },
    sound: 'energy',
  },
  {
    id: 'echosplitter', nameKey: 'weapon.echosplitter.name', descKey: 'weapon.echosplitter.desc',
    category: 'experimental', slot: 'primary', damage: 26, headMul: 1.4, limbMul: 0.88,
    fireMode: 'semi', fireRate: 2.15, mag: 10, reserve: 40, reload: 1.75, reloadEmpty: 1.95,
    spread: { hip: 0.01, ads: 0.002, move: 0.006, air: 0.016, slide: 0.008 },
    recoil: pattern(8, 0.9, 0.08, 0.4, 0), recoilRecovery: 10, heat: 0,
    range: 40, falloffStart: 16, falloff: 0.75, mobility: 1.0, adsTime: 0.15, sprintToFire: 0.1,
    pellets: 1, projectile: true, projectileSpeed: 78, splitAt: 10, splitCount: 3, splitDamage: 22, splitSpread: 0.07,
    gravity: 0, radius: 0.08, rarity: 'experimental',
    attachments: ['optic', 'mag'],
    visual: { color: '#c9b8a0', accent: '#ffb03a', barrel: 0.42, mag: 'cell', stock: false, optic: 'holo', glow: true },
    sound: 'energy',
  },
  {
    id: 'gravneedle', nameKey: 'weapon.gravneedle.name', descKey: 'weapon.gravneedle.desc',
    category: 'experimental', slot: 'primary', damage: 55, headMul: 1.35, limbMul: 0.9,
    fireMode: 'semi', fireRate: 1.05, mag: 5, reserve: 20, reload: 1.85, reloadEmpty: 2.05,
    spread: { hip: 0.006, ads: 0.001, move: 0.004, air: 0.01, slide: 0.004 },
    recoil: pattern(5, 1.0, 0.02, 0.2, 0), recoilRecovery: 8, heat: 0,
    range: 42, falloffStart: 16, falloff: 0.9, mobility: 0.96, adsTime: 0.16, sprintToFire: 0.12,
    pellets: 1, projectile: true, projectileSpeed: 34, gravity: 7.5, radius: 0.09, slow: 0.38, slowTime: 0.65,
    rarity: 'experimental',
    attachments: ['optic'],
    visual: { color: '#5a6a58', accent: '#b6ff8a', barrel: 0.5, mag: 'cell', stock: true, optic: 'holo', glow: true },
    sound: 'projectile',
  },
  {
    id: 'vectorblade', nameKey: 'weapon.vectorblade.name', descKey: 'weapon.vectorblade.desc',
    category: 'melee', slot: 'melee', damage: 60, headMul: 1.15, limbMul: 1,
    fireMode: 'semi', fireRate: 1.5, mag: 1, reserve: 1, reload: 0, reloadEmpty: 0,
    spread: { hip: 0, ads: 0, move: 0, air: 0, slide: 0 },
    recoil: [[0, 0]], recoilRecovery: 1, heat: 0,
    range: 2.35, falloffStart: 2.35, falloff: 1, mobility: 1.08, adsTime: 0.1, sprintToFire: 0,
    melee: true, meleeArc: 0.95, meleeCd: 0.62, lunge: 4.2, pellets: 1, projectile: false,
    rarity: 'standard', attachments: [],
    visual: { color: '#d0d6de', accent: '#5cffd6', barrel: 0.42, mag: 'none', stock: false, optic: 'iron', blade: true },
    sound: 'melee',
  },
  {
    id: 'shockknuckle', nameKey: 'weapon.shockknuckle.name', descKey: 'weapon.shockknuckle.desc',
    category: 'melee', slot: 'melee', damage: 85, headMul: 1.05, limbMul: 1,
    fireMode: 'semi', fireRate: 1.05, mag: 1, reserve: 1, reload: 0, reloadEmpty: 0,
    spread: { hip: 0, ads: 0, move: 0, air: 0, slide: 0 },
    recoil: [[0, 0]], recoilRecovery: 1, heat: 0,
    range: 1.75, falloffStart: 1.75, falloff: 1, mobility: 1.04, adsTime: 0.1, sprintToFire: 0,
    melee: true, meleeArc: 0.7, meleeCd: 0.95, lunge: 2.4, slow: 0.25, slowTime: 0.35,
    pellets: 1, projectile: false, rarity: 'standard', attachments: [],
    visual: { color: '#8a939c', accent: '#ffb03a', barrel: 0.12, mag: 'none', stock: false, optic: 'iron', fist: true },
    sound: 'melee_heavy',
  },
];

export const WEAPONS = Object.fromEntries(LIST.map((w) => [w.id, w]));
export const WEAPON_LIST = LIST;
export const WEAPON_CATEGORIES = ['ar', 'smg', 'shotgun', 'sniper', 'marksman', 'lmg', 'pistol', 'experimental', 'melee'];

export const GUN_GAME_LADDER = [
  'flick2', 'sparkside', 'kestrel', 'ripcord', 'linecut', 'cinderline', 'velvet',
  'hammerfall', 'scatterwake', 'longbow', 'furnace', 'helix', 'ashford', 'quietmeridian',
  'glassline', 'vectorblade',
];

export function getWeapon(id) {
  return WEAPONS[id] || WEAPONS.linecut;
}

export function weaponsBySlot(slot) {
  return LIST.filter((w) => w.slot === slot);
}

export function resolveWeapon(state) {
  const base = getWeapon(state?.defId || state?.id || 'linecut');
  const ids = state?.attachments || [];
  const mod = {
    range: 1, reload: 1, mobility: 1, recoil: 1, ads: 1, zoom: 1, mag: 1,
  };
  const applied = [];
  const used = new Set();
  for (const id of ids) {
    const a = ATTACHMENTS[id];
    if (!a || used.has(a.slot)) continue;
    if (base.attachments && !base.attachments.includes(a.slot)) continue;
    used.add(a.slot);
    applied.push(id);
    mod.range *= a.range || 1;
    mod.reload *= a.reload || 1;
    mod.mobility *= a.mobility || 1;
    mod.recoil *= a.recoil || 1;
    mod.ads *= a.ads || 1;
    mod.zoom *= a.zoom || 1;
    mod.mag *= a.mag || 1;
  }
  return {
    ...base,
    spread: { ...base.spread },
    recoil: base.recoil,
    mag: Math.max(1, Math.round(base.mag * mod.mag)),
    reserve: base.reserve,
    reload: base.reload * mod.reload,
    reloadEmpty: base.reloadEmpty * mod.reload,
    range: base.range * mod.range,
    falloffStart: base.falloffStart * mod.range,
    mobility: base.mobility * mod.mobility,
    adsTime: base.adsTime * mod.ads,
    zoom: (base.zoom || 1) * mod.zoom,
    recoilScale: mod.recoil,
    applied,
    // Damage is intentionally untouched by attachments.
    damage: base.damage,
  };
}

export function estimateTTK(weapon, hp = 100) {
  const w = weapon.damage ? weapon : getWeapon(weapon);
  if (w.melee) return w.meleeCd || 0.7;
  const per = w.damage * (w.pellets || 1) * (w.category === 'shotgun' && w.pellets > 1 ? 0.62 : 1);
  if (per <= 0) return 99;
  const shots = Math.ceil(hp / per);
  if (w.fireMode === 'burst') {
    const burst = w.burst || 1;
    const bursts = Math.ceil(shots / burst);
    return Math.max(0, (bursts - 1) / w.fireRate + (Math.min(burst, shots) - 1) * (w.burstInterval || 0.05));
  }
  return Math.max(0, (shots - 1) / w.fireRate);
}

export function createWeaponState(id, attachments = []) {
  const def = resolveWeapon({ defId: id, attachments });
  return {
    defId: id,
    attachments: [...attachments],
    mag: def.melee ? 1 : def.mag,
    reserve: def.melee ? 1 : def.reserve,
  };
}

export function defaultLoadout(characterId = 'ryn') {
  return {
    name: 'Kit A',
    characterId,
    primary: createWeaponState('linecut'),
    secondary: createWeaponState('flick2'),
    melee: createWeaponState('vectorblade'),
  };
}
