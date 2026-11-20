// Draws a dungeon map on a canvas (editor and PNG export). Old-school parchment look.
import { CELL, FEATURES, roomLabelPos, roomCells, getCell } from './generator.js';

export const MAP_STYLES = {
  parchment: { rock: '#3a2f25', rockLine: '#4a3d30', floor: '#f2e6c9', grid: '#d9c79f', water: '#8fbcd0', rubble: '#b9a37a', wall: '#2a2119', text: '#7a1f1f', feature: '#2a2119', sel: '#c99a2e' },
  blueprint: { rock: '#1d3557', rockLine: '#24406a', floor: '#e8f1fb', grid: '#b9cfe8', water: '#7fb2e5', rubble: '#9bb3cc', wall: '#0f2340', text: '#0f2340', feature: '#0f2340', sel: '#e63946' },
  ink: { rock: '#ffffff', rockLine: '#e6e6e6', floor: '#ffffff', grid: '#d8d8d8', water: '#cfe3f1', rubble: '#bdbdbd', wall: '#111111', text: '#111111', feature: '#111111', sel: '#d4380d' },
};

export function drawMap(ctx, dg, { cell = 20, style = 'parchment', selected = null, hover = null, drag = null, grid = true } = {}) {
  const P = MAP_STYLES[style] || MAP_STYLES.parchment;
  const { w, h } = dg.map;
  ctx.save();
  ctx.fillStyle = P.rock;
  ctx.fillRect(0, 0, w * cell, h * cell);
  // rock hatching
  ctx.strokeStyle = P.rockLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = -h; k < w; k += 1) { ctx.moveTo(k * cell, h * cell); ctx.lineTo((k + h) * cell, 0); }
  ctx.stroke();
  // open cells
  for (let y = 0; y < h; y++) {
    const row = dg.map.cells[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === CELL.ROCK) continue;
      ctx.fillStyle = ch === CELL.WATER ? P.water : P.floor;
      ctx.fillRect(x * cell, y * cell, cell, cell);
      if (ch === CELL.RUBBLE) {
        ctx.fillStyle = P.rubble;
        for (const [dx, dy] of [[0.25, 0.3], [0.7, 0.25], [0.45, 0.65], [0.8, 0.75], [0.2, 0.8]]) {
          ctx.beginPath(); ctx.arc((x + dx) * cell, (y + dy) * cell, cell * 0.07, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (ch === CELL.WATER) {
        ctx.strokeStyle = 'rgba(255,255,255,.55)';
        ctx.beginPath();
        ctx.moveTo((x + 0.2) * cell, (y + 0.5) * cell);
        ctx.quadraticCurveTo((x + 0.35) * cell, (y + 0.35) * cell, (x + 0.5) * cell, (y + 0.5) * cell);
        ctx.quadraticCurveTo((x + 0.65) * cell, (y + 0.65) * cell, (x + 0.8) * cell, (y + 0.5) * cell);
        ctx.stroke();
      }
    }
  }
  // grid lines on open cells
  if (grid) {
    ctx.strokeStyle = P.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (dg.map.cells[y][x] === CELL.ROCK) continue;
      ctx.rect(x * cell + 0.5, y * cell + 0.5, cell, cell);
    }
    ctx.stroke();
  }
  // walls: edges between open and rock cells
  ctx.strokeStyle = P.wall;
  ctx.lineWidth = Math.max(2, cell / 8);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (dg.map.cells[y][x] === CELL.ROCK) continue;
    const rock = (dx, dy) => getCell(dg.map, x + dx, y + dy) === CELL.ROCK;
    if (rock(0, -1)) { ctx.moveTo(x * cell, y * cell); ctx.lineTo((x + 1) * cell, y * cell); }
    if (rock(0, 1)) { ctx.moveTo(x * cell, (y + 1) * cell); ctx.lineTo((x + 1) * cell, (y + 1) * cell); }
    if (rock(-1, 0)) { ctx.moveTo(x * cell, y * cell); ctx.lineTo(x * cell, (y + 1) * cell); }
    if (rock(1, 0)) { ctx.moveTo((x + 1) * cell, y * cell); ctx.lineTo((x + 1) * cell, (y + 1) * cell); }
  }
  ctx.stroke();
  // selected room
  if (selected) {
    const room = dg.map.rooms.find((r) => r.id === selected);
    if (room) {
      ctx.fillStyle = 'rgba(201,154,46,.18)';
      for (const [x, y] of roomCells(room)) if (dg.map.cells[y]?.[x] !== CELL.ROCK) ctx.fillRect(x * cell, y * cell, cell, cell);
      ctx.strokeStyle = P.sel;
      ctx.lineWidth = 2;
      if (!room.cells) ctx.strokeRect(room.x * cell + 1, room.y * cell + 1, room.w * cell - 2, room.h * cell - 2);
    }
  }
  // features
  for (const f of dg.map.features) drawFeature(ctx, dg, f, cell, P);
  // room numbers
  ctx.font = `bold ${Math.round(cell * 0.75)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const room of dg.map.rooms) {
    const [lx, ly] = roomLabelPos(room);
    const cx = (lx + 0.5) * cell;
    const cy = (ly + 0.5) * cell;
    ctx.fillStyle = 'rgba(242,230,201,.85)';
    ctx.beginPath(); ctx.arc(cx, cy, cell * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = P.text;
    ctx.fillText(String(room.n), cx, cy + 1);
  }
  // drag rectangle / hover cell
  if (drag) {
    const x0 = Math.min(drag.x0, drag.x1);
    const y0 = Math.min(drag.y0, drag.y1);
    ctx.strokeStyle = P.sel;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 * cell, y0 * cell, (Math.abs(drag.x1 - drag.x0) + 1) * cell, (Math.abs(drag.y1 - drag.y0) + 1) * cell);
    ctx.setLineDash([]);
  } else if (hover) {
    ctx.strokeStyle = P.sel;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(hover.x * cell + 1, hover.y * cell + 1, cell - 2, cell - 2);
  }
  ctx.restore();
}

function drawFeature(ctx, dg, f, cell, P) {
  const x = f.x * cell;
  const y = f.y * cell;
  const open = (dx, dy) => getCell(dg.map, f.x + dx, f.y + dy) !== CELL.ROCK;
  const horizontalPassage = open(-1, 0) && open(1, 0) && !(open(0, -1) && open(0, 1));
  ctx.save();
  ctx.fillStyle = P.feature;
  ctx.strokeStyle = P.feature;
  ctx.lineWidth = Math.max(1.5, cell / 12);
  const doorRect = () => (horizontalPassage
    ? [x + cell * 0.38, y + cell * 0.12, cell * 0.24, cell * 0.76]
    : [x + cell * 0.12, y + cell * 0.38, cell * 0.76, cell * 0.24]);
  if (f.type === 'door' || f.type === 'secret') {
    const [rx, ry, rw, rh] = doorRect();
    ctx.fillStyle = P.floor;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);
    if (f.type === 'secret') {
      ctx.fillStyle = P.text;
      ctx.font = `bold ${Math.round(cell * 0.6)}px Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('S', x + cell / 2, y + cell / 2 + 1);
    }
  } else if (f.type === 'portcullis') {
    const [rx, ry, rw, rh] = doorRect();
    ctx.beginPath();
    for (let k = 0; k <= 3; k++) {
      if (horizontalPassage) { ctx.moveTo(rx + rw / 2, ry + (rh * k) / 3); ctx.arc(rx + rw / 2, ry + (rh * k) / 3, 1.2, 0, 7); }
      else { ctx.moveTo(rx + (rw * k) / 3, ry + rh / 2); ctx.arc(rx + (rw * k) / 3, ry + rh / 2, 1.2, 0, 7); }
    }
    ctx.fill();
  } else if (f.type === 'stairs-up' || f.type === 'stairs-down') {
    ctx.lineWidth = 1.2;
    for (let k = 1; k <= 4; k++) {
      const t = (k / 5) * cell;
      const inset = f.type === 'stairs-down' ? (k / 5) * cell * 0.3 : (1 - k / 5) * cell * 0.3;
      ctx.beginPath(); ctx.moveTo(x + inset, y + t); ctx.lineTo(x + cell - inset, y + t); ctx.stroke();
    }
  } else {
    const icon = FEATURES[f.type]?.icon || '?';
    ctx.font = `bold ${Math.round(cell * 0.7)}px Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = f.type === 'trap' ? P.text : P.feature;
    ctx.fillText(icon, x + cell / 2, y + cell / 2 + 1);
  }
  ctx.restore();
}

export function mapToPNG(dg, { cell = 28, style = 'parchment' } = {}) {
  const c = document.createElement('canvas');
  c.width = dg.map.w * cell;
  c.height = dg.map.h * cell;
  drawMap(c.getContext('2d'), dg, { cell, style });
  return c;
}
