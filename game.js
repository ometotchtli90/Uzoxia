
// ═══════════════════════════════════════════════════════════════════
//  WORLD MAP ENGINE  –  game.js
//  Biome / encounter / boss data sourced from Map.xlsx (Biotopes sheet)
//
//  ⚠ MAP DATA NOTE:
//  The xlsx stores biome layout as cell fill colours, which cannot be
//  exported as plain text. A procedural map is used as a placeholder.
//  To use your real map, replace generateMap() with a 2-D array of
//  MAP_W × MAP_H biome keys, e.g.:
//
//    const map = [
//      ["forest","forest","water", ...],   // row 0
//      ["plains","meadows","water", ...],  // row 1
//      ...
//    ];
//
//  Valid keys: vulcan | water | water1 | water2 | meadows | swamp |
//              forest | forest1 | forest2 | mountain1 | mountain2 |
//              snow | plains | plains1 | plains2 | desert | desert1
// ═══════════════════════════════════════════════════════════════════
const canvas  = document.getElementById("game");
const ctx     = canvas.getContext("2d");
const elZoom  = document.getElementById("zoomVal");
const elTip   = document.getElementById("tooltip");
const elLeg   = document.getElementById("legend");
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
resize();
window.addEventListener("resize", resize);
// ── Camera ──────────────────────────────────────────────────────────
let camX = 0, camY = 0, zoom = 1;
// ── Map dimensions ───────────────────────────────────────────────────
const TILE  = 48;   // px per tile
const MAP_W = 100;
const MAP_H = 70;
// ═══════════════════════════════════════════════════════════════════
//  BIOME DEFINITIONS
//  danger values taken directly from the numeric row in Biotopes sheet
// ═══════════════════════════════════════════════════════════════════
const BIOMES = {
  vulcan:    { label:"Vulcan+3",   danger:0.99, base:"#6B0000", hi:"#FF6B00", pat:"lava"   },
  water:     { label:"Water",      danger:0.30, base:"#1565C0", hi:"#42A5F5", pat:"wave"   },
  water1:    { label:"Water-1",    danger:0.60, base:"#0277BD", hi:"#29B6F6", pat:"wave"   },
  water2:    { label:"Water-2",    danger:0.99, base:"#01579B", hi:"#039BE5", pat:"wave"   },
  meadows:   { label:"Meadows",    danger:0.20, base:"#558B2F", hi:"#8BC34A", pat:"dots"   },
  swamp:     { label:"Swamp",      danger:0.25, base:"#2D4A1E", hi:"#5D8A3C", pat:"tangle" },
  forest:    { label:"Forest",     danger:0.30, base:"#1B5E20", hi:"#43A047", pat:"trees"  },
  forest1:   { label:"Forest+1",   danger:0.60, base:"#145218", hi:"#2E7D32", pat:"trees"  },
  forest2:   { label:"Forest+2",   danger:0.99, base:"#0A3D10", hi:"#1B5E20", pat:"trees"  },
  mountain1: { label:"Mountain+1", danger:0.60, base:"#607D8B", hi:"#90A4AE", pat:"peaks"  },
  mountain2: { label:"Mountain+2", danger:0.99, base:"#37474F", hi:"#607D8B", pat:"peaks"  },
  snow:      { label:"Snow+3",     danger:0.60, base:"#90A4AE", hi:"#ECEFF1", pat:"snow"   },
  plains:    { label:"Plains",     danger:0.30, base:"#7CB342", hi:"#AED581", pat:"lines"  },
  plains1:   { label:"Plains+1",   danger:0.60, base:"#C6A700", hi:"#FDD835", pat:"lines"  },
  plains2:   { label:"Plains+2",   danger:0.99, base:"#8D6E00", hi:"#BC9B00", pat:"lines"  },
  desert:    { label:"Desert",     danger:0.60, base:"#F9A825", hi:"#FFD54F", pat:"dunes"  },
  desert1:   { label:"Desert+1",   danger:0.99, base:"#E65100", hi:"#FF8F00", pat:"dunes"  },
};
// ═══════════════════════════════════════════════════════════════════
//  ENCOUNTER TABLES  (from Biotopes sheet)
// ═══════════════════════════════════════════════════════════════════
const ENCOUNTERS = {
  vulcan:    [["Lavaspawn",60],["Lavaelement",29]],
  water:     [["Namazu",15],["Whale",10],["TurtleIsland",5]],
  water1:    [["Nymph",25],["Rainbowfish",20],["Siren",10],["Leviathan",5]],
  water2:    [["Leviathan",30],["Hydra",25],["SeaSerpent",20],["Kraken",20],["Iku-Turso",4]],
  meadows:   [["Bear",5],["Tiger",5],["Qilin",2],["Jackalope",1]],
  swamp:     [["Noggle",15],["Wisp",2],["Kelpie",2],["Basilisk",1]],
  forest:    [["Centaur",15],["Bakru",10],["Lindworm",3],["Peryton",2]],
  forest1:   [["Faun",25],["Dryad",20],["Chimeara",10],["Banshee",5]],
  forest2:   [["Banshee",30],["Satyr",25],["Crone",20],["Ouphe",20],["Fungal Behemoth",4]],
  mountain1: [["Harpy",25],["Cyclops",20],["Cockatrice",10],["Barghest",5]],
  mountain2: [["Cerberus",30],["Wyvern",25],["Keshalyi",20],["Sphinx",20],["Camazotz",4]],
  snow:      [["Wolf",55],["Adlet",3],["Amarok",2]],
  plains:    [["Coyote",25],["Chupacabra",24],["Cyclops",1]],
  plains1:   [["Scorpius",25],["Minotaur",20],["Griffin",5]],
  plains2:   [["Barghest",30],["Gargoyle",25],["Giant",20],["Sphinx",20],["Phoenix",4]],
  desert:    [["Hyena",48],["Jurogumo",1],["Antlion",1]],
  desert1:   [["Manticore",30],["Antlion",25],["Scorpius",20],["Lamia",20],["Tsuchigumo",4]],
};
// ═══════════════════════════════════════════════════════════════════
//  BOSS LOCATIONS  (Excel cell coords → MAP_W × MAP_H)
//  Original grid is ~286 cols × 140 rows → scaled proportionally
// ═══════════════════════════════════════════════════════════════════
function colToNum(s) {          // "AQ" → 43
  let n = 0;
  for (const c of s.toUpperCase()) n = n * 26 + c.charCodeAt(0) - 64;
  return n;
}
function exXY(col, row) {
  return {
    x: Math.min(Math.round(col / 286 * MAP_W), MAP_W - 1),
    y: Math.min(Math.round(row / 140 * MAP_H), MAP_H - 1),
  };
}
const BOSSES = [
  { name:"Dragon White",  level:7, icon:"🐉", ring:"#FFFFFF", ...exXY(colToNum("AQ"), 133) },
  { name:"Dragon Black",  level:7, icon:"🐉", ring:"#AAAAAA", ...exXY(colToNum("CK"), 30)  },
  { name:"Dragon Red",    level:6, icon:"🐉", ring:"#FF3333", ...exXY(colToNum("O"),  70)   },
  { name:"Dragon Yellow", level:6, icon:"🐉", ring:"#FFD700", ...exXY(colToNum("GP"), 78)   },
  { name:"Anansi",        level:6, icon:"🕷",  ring:"#A0522D", ...exXY(colToNum("DK"), 140)  },
  { name:"Epimetheus",    level:6, icon:"⚡",  ring:"#9B59B6", ...exXY(colToNum("JZ"), 72)   },
  { name:"Nian",          level:6, icon:"🦁",  ring:"#E74C3C", ...exXY(colToNum("BF"), 36)   },
  { name:"Suku-na-biko",  level:6, icon:"✨",  ring:"#F39C12", ...exXY(colToNum("FT"), 51)   },
  { name:"Cthulhu",       level:7, icon:"🐙",  ring:"#27AE60", ...exXY(colToNum("IE"), 117)  },
  { name:"Ghost Whale",   level:5, icon:"🐋",  ring:"#AED6F1", ...exXY(colToNum("HL"), 5)    },
];
// ═══════════════════════════════════════════════════════════════════
//  NOISE HELPERS  (for procedural map)
// ═══════════════════════════════════════════════════════════════════
function rng(x, y, s) {
  const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.3) * 43758.5453;
  return n - Math.floor(n);
}
function smooth(x, y, s) {
  return (rng(x-1,y-1,s)+rng(x+1,y-1,s)+rng(x-1,y+1,s)+rng(x+1,y+1,s)) / 16
       + (rng(x-1,y,s)+rng(x+1,y,s)+rng(x,y-1,s)+rng(x,y+1,s)) / 8
       + rng(x, y, s) / 4;
}
function fbm(x, y, oct, s) {
  let v = 0, a = 1, f = 1, m = 0;
  for (let i = 0; i < oct; i++) {
    v += smooth(x * f / 13, y * f / 13, s + i) * a;
    m += a; a *= 0.5; f *= 2;
  }
  return v / m;
}
// ═══════════════════════════════════════════════════════════════════
//  MAP GENERATION  (replace with real data — see note at top)
// ═══════════════════════════════════════════════════════════════════
function generateMap() {
  const grid = [];
  for (let y = 0; y < MAP_H; y++) {
    grid[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      const elev = fbm(x, y, 5, 0);
      const mois = fbm(x, y, 5, 7);
      const heat = fbm(x, y, 5, 13);
      const volc = fbm(x, y, 6, 23);
      let b;
      if      (volc > 0.85)                              b = "vulcan";
      else if (elev < 0.15)                              b = "water2";
      else if (elev < 0.22)                              b = "water1";
      else if (elev < 0.30)                              b = "water";
      else if (elev < 0.36 && mois > 0.62)               b = "swamp";
      else if (elev > 0.82 && heat < 0.32)               b = "snow";
      else if (elev > 0.75)                              b = "mountain2";
      else if (elev > 0.65)                              b = "mountain1";
      else if (heat > 0.74 && mois < 0.30)               b = elev > 0.55 ? "desert1" : "desert";
      else if (mois > 0.65 && heat > 0.35 && heat < 0.75)
        b = elev > 0.58 ? "forest2" : elev > 0.48 ? "forest1" : "forest";
      else if (elev > 0.42 && mois > 0.44 && heat < 0.62) b = "meadows";
      else if (elev > 0.50 && mois < 0.40)
        b = heat > 0.64 ? "plains2" : heat > 0.50 ? "plains1" : "plains";
      else                                               b = "plains";
      grid[y][x] = b;
    }
  }
  return grid;
}
const map = generateMap();
// ═══════════════════════════════════════════════════════════════════
//  FOG OF WAR   0 = dark · 1 = visited/dim · 2 = fully visible
// ═══════════════════════════════════════════════════════════════════
const fog = Array.from({ length: MAP_H }, () => new Uint8Array(MAP_W));
function reveal(cx, cy, r = 3) {
  for (let j = -r; j <= r; j++) {
    for (let i = -r; i <= r; i++) {
      const tx = cx + i, ty = cy + j;
      if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) continue;
      const d = Math.sqrt(i * i + j * j);
      if      (d <= r)       fog[ty][tx] = Math.max(fog[ty][tx], 2);
      else if (d <= r + 1.5) fog[ty][tx] = Math.max(fog[ty][tx], 1);
    }
  }
}
reveal(MAP_W >> 1, MAP_H >> 1, 5);   // start revealed area
// ═══════════════════════════════════════════════════════════════════
//  TILE CACHE  — pre-render each biome into an OffscreenCanvas
// ═══════════════════════════════════════════════════════════════════
function darken(hex, amt) {
  const r = Math.max(0, parseInt(hex.slice(1,3),16) - amt);
  const g = Math.max(0, parseInt(hex.slice(3,5),16) - amt);
  const b = Math.max(0, parseInt(hex.slice(5,7),16) - amt);
  return `rgb(${r},${g},${b})`;
}
function buildTile(key) {
  const oc = typeof OffscreenCanvas !== "undefined"
    ? new OffscreenCanvas(TILE, TILE)
    : (() => { const c = document.createElement("canvas"); c.width = TILE; c.height = TILE; return c; })();
  const c  = oc.getContext("2d");
  const b  = BIOMES[key];
  const ks = key.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0);
  // Deterministic position helper inside tile bounds
  const P = (i, j) => ({
    x: rng(ks + i * 7, j * 3 + 1, 5) * (TILE - 12) + 6,
    y: rng(ks + i * 7 + 3, j * 3 + 4, 8) * (TILE - 12) + 6,
  });
  // Base gradient fill
  const g = c.createLinearGradient(0, 0, TILE, TILE);
  g.addColorStop(0, b.base);
  g.addColorStop(1, darken(b.base, 28));
  c.fillStyle = g;
  c.fillRect(0, 0, TILE, TILE);
  // Pattern overlay
  c.save();
  switch (b.pat) {
    case "wave":
      c.globalAlpha = 0.22; c.strokeStyle = b.hi; c.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const wy = TILE * (i + 1) / 4;
        c.beginPath(); c.moveTo(0, wy);
        c.bezierCurveTo(TILE/3, wy-5, TILE*2/3, wy+5, TILE, wy);
        c.stroke();
      }
      break;
    case "lava":
      c.globalAlpha = 0.32; c.strokeStyle = b.hi; c.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const {x:ox,y:oy} = P(i,0), {x:ex,y:ey} = P(i,1);
        c.beginPath(); c.moveTo(ox,oy); c.lineTo(ex,ey); c.stroke();
      }
      c.globalAlpha = 0.18; c.fillStyle = "#FF6B00";
      const {x:lx,y:ly} = P(10,10);
      c.beginPath(); c.ellipse(lx, ly, TILE*.22, TILE*.13, 0.5, 0, Math.PI*2); c.fill();
      break;
    case "trees": {
      const count = key.endsWith("2") ? 6 : key.endsWith("1") ? 4 : 3;
      c.globalAlpha = 0.28; c.fillStyle = b.hi;
      for (let i = 0; i < count; i++) {
        const {x:tx,y:ty_} = P(i, i+1);
        c.beginPath();
        c.moveTo(tx, ty_-6); c.lineTo(tx-4, ty_+3); c.lineTo(tx+4, ty_+3);
        c.closePath(); c.fill();
      }
      break;
    }
    case "peaks":
      c.globalAlpha = 0.28; c.fillStyle = b.hi;
      c.beginPath();
      c.moveTo(TILE/2,5); c.lineTo(5,TILE-6); c.lineTo(TILE-5,TILE-6);
      c.closePath(); c.fill();
      c.globalAlpha = 0.42; c.fillStyle = "#ECEFF1";
      c.beginPath();
      c.moveTo(TILE/2,5); c.lineTo(TILE/2-8,TILE/2-4); c.lineTo(TILE/2+8,TILE/2-4);
      c.closePath(); c.fill();
      break;
    case "snow":
      c.globalAlpha = 0.40; c.strokeStyle = "#fff"; c.lineWidth = 1.5;
      for (let a = 0; a < 6; a++) {
        const rad = a * Math.PI / 3;
        c.beginPath(); c.moveTo(TILE/2, TILE/2);
        c.lineTo(TILE/2 + Math.cos(rad)*TILE*.36, TILE/2 + Math.sin(rad)*TILE*.36);
        c.stroke();
      }
      break;
    case "dots":
      c.globalAlpha = 0.28; c.fillStyle = b.hi;
      for (let i = 0; i < 5; i++) {
        const {x:dx,y:dy} = P(i, i+2);
        c.beginPath(); c.arc(dx, dy, 2.5, 0, Math.PI*2); c.fill();
      }
      break;
    case "tangle":
      c.globalAlpha = 0.25; c.strokeStyle = b.hi; c.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const {x:ox,y:oy} = P(i, i+9);
        c.beginPath(); c.arc(ox, oy, 6.5, 0, Math.PI*2); c.stroke();
      }
      break;
    case "lines":
      c.globalAlpha = 0.25; c.strokeStyle = b.hi; c.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const ly = TILE * (i+1) / 5;
        c.beginPath(); c.moveTo(3, ly); c.lineTo(TILE-3, ly+2); c.stroke();
      }
      break;
    case "dunes":
      c.globalAlpha = 0.20; c.fillStyle = b.hi;
      c.beginPath(); c.ellipse(TILE*.50, TILE*.63, TILE*.40, TILE*.15, 0.1, 0, Math.PI*2); c.fill();
      c.globalAlpha = 0.14;
      c.beginPath(); c.ellipse(TILE*.30, TILE*.38, TILE*.23, TILE*.10, -0.3, 0, Math.PI*2); c.fill();
      break;
  }
  c.restore();
  // Subtle grid edge
  c.strokeStyle = "rgba(0,0,0,0.13)"; c.lineWidth = 0.5;
  c.strokeRect(0.5, 0.5, TILE-1, TILE-1);
  return oc;
}
const TILE_CACHE = {};
for (const key of Object.keys(BIOMES)) TILE_CACHE[key] = buildTile(key);
// ═══════════════════════════════════════════════════════════════════
//  LEGEND
// ═══════════════════════════════════════════════════════════════════
for (const [key, b] of Object.entries(BIOMES)) {
  const div = document.createElement("div");
  div.className = "legend-item";
  div.innerHTML = `<div class="legend-swatch" style="background:${b.base}"></div><span>${b.label}</span>`;
  elLeg.appendChild(div);
}
// ═══════════════════════════════════════════════════════════════════
//  INPUT
// ═══════════════════════════════════════════════════════════════════
let dragging = false, lastX = 0, lastY = 0, didDrag = false;
canvas.addEventListener("mousedown", e => { dragging = true; didDrag = false; lastX = e.clientX; lastY = e.clientY; });
canvas.addEventListener("mouseup",   e => { if (dragging && !didDrag) handleClick(e); dragging = false; });
canvas.addEventListener("mouseleave",  () => { dragging = false; });
canvas.addEventListener("mousemove", e => {
  if (dragging) {
    camX += (e.clientX - lastX) / zoom;
    camY += (e.clientY - lastY) / zoom;
    lastX = e.clientX; lastY = e.clientY;
    didDrag = true;
  }
  updateTooltip(e.clientX, e.clientY);
});
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  const wx = (e.clientX - canvas.width  / 2) / zoom - camX;
  const wy = (e.clientY - canvas.height / 2) / zoom - camY;
  zoom = Math.max(0.15, Math.min(5, zoom * factor));
  camX = (e.clientX - canvas.width  / 2) / zoom - wx;
  camY = (e.clientY - canvas.height / 2) / zoom - wy;
  elZoom.textContent = zoom.toFixed(2);
}, { passive: false });
// Touch
let lastPinch = 0;
canvas.addEventListener("touchstart", e => {
  e.preventDefault();
  if (e.touches.length === 1) { dragging = true; didDrag = false; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; }
  if (e.touches.length === 2)
    lastPinch = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
}, { passive: false });
canvas.addEventListener("touchmove", e => {
  e.preventDefault();
  if (e.touches.length === 1 && dragging) {
    camX += (e.touches[0].clientX - lastX) / zoom;
    camY += (e.touches[0].clientY - lastY) / zoom;
    lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; didDrag = true;
  }
  if (e.touches.length === 2) {
    const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
    zoom = Math.max(0.15, Math.min(5, zoom * d / lastPinch));
    lastPinch = d;
    elZoom.textContent = zoom.toFixed(2);
  }
}, { passive: false });
canvas.addEventListener("touchend", () => { dragging = false; });
// ── Coordinate helpers ─────────────────────────────────────────────
function screenToWorld(sx, sy) {
  return { wx: (sx - canvas.width/2)  / zoom - camX,
           wy: (sy - canvas.height/2) / zoom - camY };
}
function worldToTile(wx, wy) {
  return { tx: Math.floor(wx / TILE), ty: Math.floor(wy / TILE) };
}
// ── Tooltip ────────────────────────────────────────────────────────
function updateTooltip(sx, sy) {
  const { wx, wy } = screenToWorld(sx, sy);
  const { tx, ty } = worldToTile(wx, wy);
  if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H || fog[ty][tx] === 0) {
    elTip.classList.remove("visible"); return;
  }
  const bKey = map[ty][tx];
  const b    = BIOMES[bKey];
  const enc  = (ENCOUNTERS[bKey] || []).slice(0,3).map(([n,p]) => `${n} ${p}%`).join(" · ");
  const boss = BOSSES.find(bo => bo.x === tx && bo.y === ty);
  const bStr = boss ? ` &nbsp;│&nbsp; <span class="boss-tag">${boss.icon} ${boss.name} (Lv${boss.level})</span>` : "";
  elTip.innerHTML = `<strong>${b.label}</strong> [${tx},${ty}] &nbsp;│&nbsp; ⚠ ${(b.danger*100)|0}% &nbsp;│&nbsp; ${enc}${bStr}`;
  elTip.classList.add("visible");
}
// ── Click: reveal tiles ────────────────────────────────────────────
function handleClick(e) {
  const { wx, wy } = screenToWorld(e.clientX, e.clientY);
  const { tx, ty } = worldToTile(wx, wy);
  if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return;
  reveal(tx, ty, 3);
}
// ── Centre camera on map ───────────────────────────────────────────
camX = -(MAP_W * TILE) / 2;
camY = -(MAP_H * TILE) / 2;
// ═══════════════════════════════════════════════════════════════════
//  RENDER LOOP
// ═══════════════════════════════════════════════════════════════════
function draw(ts) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#050508";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(zoom, 0, 0, zoom, canvas.width/2 + camX*zoom, canvas.height/2 + camY*zoom);
  // Viewport culling — only draw tiles on screen
  const x0 = Math.max(0,     Math.floor((-canvas.width /2/zoom - camX) / TILE));
  const y0 = Math.max(0,     Math.floor((-canvas.height/2/zoom - camY) / TILE));
  const x1 = Math.min(MAP_W, Math.ceil( ( canvas.width /2/zoom - camX) / TILE) + 1);
  const y1 = Math.min(MAP_H, Math.ceil( ( canvas.height/2/zoom - camY) / TILE) + 1);
  // ── Tiles ────────────────────────────────────────────────────────
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const f  = fog[y][x];
      const px = x * TILE, py = y * TILE;
      if (f === 0) {
        ctx.fillStyle = "#050508";
        ctx.fillRect(px, py, TILE, TILE);
        continue;
      }
      ctx.drawImage(TILE_CACHE[map[y][x]], px, py, TILE, TILE);
      if (f === 1) {                          // visited, not currently lit
        ctx.fillStyle = "rgba(0,0,0,0.52)";
        ctx.fillRect(px, py, TILE, TILE);
      }
    }
  }
  // ── Grid coords at high zoom ──────────────────────────────────────
  if (zoom > 2.8) {
    ctx.fillStyle  = "rgba(255,255,255,0.18)";
    ctx.font       = `${TILE * 0.17}px monospace`;
    ctx.textAlign  = "left"; ctx.textBaseline = "top";
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++)
        if (fog[y][x] === 2)
          ctx.fillText(`${x},${y}`, x*TILE+2, y*TILE+2);
  }
  // ── Bosses ────────────────────────────────────────────────────────
  const pulse = (Math.sin(ts * 0.0025) + 1) * 0.5;
  for (const boss of BOSSES) {
    if (boss.x < x0 || boss.x >= x1 || boss.y < y0 || boss.y >= y1) continue;
    if (fog[boss.y][boss.x] === 0) continue;
    const px = boss.x * TILE + TILE / 2;
    const py = boss.y * TILE + TILE / 2;
    // Pulsing glow ring
    ctx.save();
    const grd = ctx.createRadialGradient(px, py, 0, px, py, TILE * 0.95);
    grd.addColorStop(0, boss.ring);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.18 + pulse * 0.35;
    ctx.fillStyle   = grd;
    ctx.beginPath(); ctx.arc(px, py, TILE * 0.95, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // Icon
    if (zoom > 0.35) {
      ctx.font          = `${Math.min(TILE * 0.72, 30)}px serif`;
      ctx.textAlign     = "center";
      ctx.textBaseline  = "middle";
      ctx.fillText(boss.icon, px, py);
    }
  }
  // ── Deep-zoom atmosphere vignette ────────────────────────────────
  if (zoom < 0.28) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const alpha = ((0.28 - zoom) / 0.28) * 0.65;
    ctx.fillStyle = `rgba(0,0,20,${alpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
