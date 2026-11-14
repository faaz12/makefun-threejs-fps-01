// Procedural canvas textures for FROSTLINE: snow, ice, steel panels, hazard
// striping, site markers and the night sky. Everything is drawn at runtime,
// so the game ships no image assets and makes no network request.
import * as THREE from 'three';

function canvasTexture(size, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(ctx, size, n, colors, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    const r = rMin + Math.random() * (rMax - rMin);
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Packed snow with sparkle and faint drift lines.
export function snowTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#dfe9f2';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 900, ['#ffffff', '#c8d8e6', '#b7c9da', '#eef4fa'], 0.5, 2.2);
    ctx.strokeStyle = 'rgba(160,185,205,0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const y = Math.random() * s;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(s * 0.3, y + 6, s * 0.7, y - 6, s, y + 3);
      ctx.stroke();
    }
  }, 8, 8);
}

// Glossy blue ice for the frozen pond, with cracks.
export function iceTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#8fc4de';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 500, ['#bfe0f0', '#6fa8c8', '#d6ecf7'], 0.5, 2.5);
    ctx.strokeStyle = 'rgba(240,250,255,0.55)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 9; i++) {
      let x = Math.random() * s;
      let y = Math.random() * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += (Math.random() - 0.5) * 90;
        y += (Math.random() - 0.5) * 90;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, 4, 4);
}

// Painted steel wall panels with rivets and a cold sheen.
export function steelTexture(base = '#3a4750', seam = '#2a343d') {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 350, ['#46545f', '#313d46', '#525f6a'], 0.5, 2);
    ctx.strokeStyle = seam;
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, s - 2, s - 2);
    ctx.beginPath();
    ctx.moveTo(0, s / 2);
    ctx.lineTo(s, s / 2);
    ctx.stroke();
    ctx.fillStyle = '#5d6b76';
    const rivets = [[14, 14], [s - 14, 14], [14, s - 14], [s - 14, s - 14], [s / 2, 14], [s / 2, s - 14]];
    for (const [x, y] of rivets) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 2, 1);
}

// Amber / dark hazard chevrons for site pads and door frames.
export function hazardTexture() {
  return canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#1c2228';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#ffb347';
    for (let i = -2; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 32, s);
      ctx.lineTo(i * 32 + 16, 0);
      ctx.lineTo(i * 32 + 32, 0);
      ctx.lineTo(i * 32 + 16, s);
      ctx.closePath();
      ctx.fill();
    }
  }, 2, 2);
}

// Big letter marker for a site pad (A or B), drawn on a dark plate.
export function siteMarkerTexture(letter, color = '#59d8c9') {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#101c26';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, s - 16, s - 16);
    ctx.fillStyle = color;
    ctx.font = 'bold 150px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, s / 2, s / 2 + 8);
  });
}

// Night sky: vertical gradient with faint stars, wrapped on a big sphere.
export function skyTexture() {
  return canvasTexture(512, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#02060d');
    g.addColorStop(0.45, '#06101d');
    g.addColorStop(0.75, '#16324a');
    g.addColorStop(1, '#1d4258');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      const a = Math.random();
      ctx.fillStyle = `rgba(255,255,255,${0.25 + a * 0.65})`;
      const r = 0.4 + a * 1.3;
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s * 0.62, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// Aurora ribbon texture: soft vertical bands, used with additive blending.
// Fades to transparent at the left/right edges so no hard billboard edge shows.
export function auroraTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, 'rgba(58,255,196,0)');
    g.addColorStop(0.5, 'rgba(58,255,196,0.75)');
    g.addColorStop(1, 'rgba(89,200,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 8) {
      const h = 40 + Math.sin(x * 0.09) * 30 + Math.random() * 20;
      ctx.fillStyle = `rgba(58,255,196,${0.10 + Math.random() * 0.12})`;
      ctx.fillRect(x, s / 2 - h / 2, 8, h);
    }
    // Horizontal fade so the ribbon dissolves at both ends.
    ctx.globalCompositeOperation = 'destination-in';
    const fade = ctx.createLinearGradient(0, 0, s, 0);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(0.2, 'rgba(0,0,0,1)');
    fade.addColorStop(0.8, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, s, s);
    ctx.globalCompositeOperation = 'source-over';
  });
}
