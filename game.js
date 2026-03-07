'use strict';

// ═══════════════════════════════════════════════════════════════════════
//  UZOXIA – WORLD MAP ENGINE  (chunk-canvas renderer)
//
//  PERFORMANCE STRATEGY
//  ─────────────────────
//  Problem : At low zoom the viewport covers tens-of-thousands of tiles.
//            Putting each tile in the DOM causes massive layout thrashing.
//
//  Solution: Pre-render the map into 32×32-tile "chunks".
//            Each chunk is painted once onto an offscreen <canvas> and
//            converted to a <img> (data-URL).  The world container then
//            holds only ~(cols/32)×(rows/32) images instead of thousands
//            of divs.  CSS transform:scale() zooms the whole container
//            on the GPU — no reflow, silky smooth.
//
//            When the user zooms in beyond DETAIL_ZOOM (default 1.5) the
//            engine switches back to individual DOM tiles for the small
//            visible area, giving full visual fidelity up close.
//
//  Browser canvas size limit is ~16 384 px per side — chunks of 32 tiles
//  at 48 px each = 1 536 px, well within every browser's budget.
// ═══════════════════════════════════════════════════════════════════════

/* ── DOM refs ──────────────────────────────────────────────────────── */
const viewport  = document.getElementById('viewport');
const world     = document.getElementById('world');
const elZoomVal = document.getElementById('zoom-val');
const tooltip   = document.getElementById('tooltip');

/* ── Config ────────────────────────────────────────────────────────── */
const TILE_PX    = 48;   // world-space pixels per tile
const CHUNK_SIZE = 32;   // tiles per chunk side
const CHUNK_PX   = TILE_PX * CHUNK_SIZE;   // 1536 px per chunk side
const PADDING    = 1;    // extra chunk buffer around viewport
const DETAIL_ZOOM = 1.5; // switch to DOM tiles above this zoom level

/* ══════════════════════════════════════════════════════════════════════
   BIOMES
══════════════════════════════════════════════════════════════════════ */
const BIOMES = {
  vulcan3:    { label:'Vulcan+3',   danger:.99, base:'#6B0000', dark:'#3A0000', hi:'#FF6B00' },
  water:      { label:'Water',      danger:.30, base:'#0277BD', dark:'#01579B', hi:'#90CAF9' },
  water1:     { label:'Water-1',    danger:.60, base:'#1565C0', dark:'#0D47A1', hi:'#4FC3F7' },
  water2:     { label:'Water-2',    danger:.99, base:'#01579B', dark:'#002F6C', hi:'#039BE5' },
  meadows:    { label:'Meadows',    danger:.20, base:'#558B2F', dark:'#33691E', hi:'#AED581' },
  swamp:      { label:'Swamp',      danger:.25, base:'#2D4A1E', dark:'#1B3010', hi:'#6A9E48' },
  forest:     { label:'Forest',     danger:.30, base:'#2E7D32', dark:'#1B5E20', hi:'#81C784' },
  forest2:    { label:'Forest+1',   danger:.60, base:'#1B5E20', dark:'#0D3E12', hi:'#43A047' },
  forest3:    { label:'Forest+2',   danger:.99, base:'#0A3D10', dark:'#052008', hi:'#2E7D32' },
  mountain1:  { label:'Mountain+1', danger:.60, base:'#546E7A', dark:'#37474F', hi:'#B0BEC5' },
  mountains2: { label:'Mountain+2', danger:.99, base:'#37474F', dark:'#1C313A', hi:'#78909C' },
  snow3:      { label:'Snow+3',     danger:.60, base:'#90A4AE', dark:'#546E7A', hi:'#ECEFF1' },
  plains:     { label:'Plains',     danger:.30, base:'#f7e860', dark:'#d6c57a', hi:'#f5e9a8' },
  plains1:    { label:'Plains+1',   danger:.60, base:'#C6A700', dark:'#8D6E00', hi:'#FDD835' },
  plain2:     { label:'Plains+2',   danger:.99, base:'#8D6E00', dark:'#5C4200', hi:'#FFCA28' },
  desert:     { label:'Desert',     danger:.60, base:'#F9A825', dark:'#C77800', hi:'#FFE082' },
  desert1:    { label:'Desert+1',   danger:.99, base:'#E65100', dark:'#9A3400', hi:'#FF8F00' },
};

/* ══════════════════════════════════════════════════════════════════════
   ENCOUNTER TABLES
══════════════════════════════════════════════════════════════════════ */
const ENCOUNTERS = {
  vulcan3:    [['Lavaspawn',60],['Lavaelement',29]],
  water:      [['Namazu',15],['Whale',10],['TurtleIsland',5]],
  water1:     [['Nymph',25],['Rainbowfish',20],['Siren',10],['Leviathan',5]],
  water2:     [['Leviathan',30],['Hydra',25],['SeaSerpent',20],['Kraken',20],['Iku-Turso',4]],
  meadows:    [['Bear',5],['Tiger',5],['Qilin',2],['Jackalope',1]],
  swamp:      [['Noggle',15],['Wisp',2],['Kelpie',2],['Basilisk',1]],
  forest:     [['Centaur',15],['Bakru',10],['Lindworm',3],['Peryton',2]],
  forest2:    [['Faun',25],['Dryad',20],['Chimeara',10],['Banshee',5]],
  forest3:    [['Banshee',30],['Satyr',25],['Crone',20],['Ouphe',20],['Fungal Behemoth',4]],
  mountain1:  [['Harpy',25],['Cyclops',20],['Cockatrice',10],['Barghest',5]],
  mountains2: [['Cerberus',30],['Wyvern',25],['Keshalyi',20],['Sphinx',20],['Camazotz',4]],
  snow3:      [['Wolf',55],['Adlet',3],['Amarok',2]],
  plains:     [['Coyote',25],['Chupacabra',24],['Cyclops',1]],
  plains1:    [['Scorpius',25],['Minotaur',20],['Griffin',5]],
  plain2:     [['Barghest',30],['Gargoyle',25],['Giant',20],['Sphinx',20],['Phoenix',4]],
  desert:     [['Hyena',48],['Jurogumo',1],['Antlion',1]],
  desert1:    [['Manticore',30],['Antlion',25],['Scorpius',20],['Lamia',20],['Tsuchigumo',4]],
};

/* ══════════════════════════════════════════════════════════════════════
   BOSS POSITIONS
══════════════════════════════════════════════════════════════════════ */
function colNum(s) {
  let n = 0;
  for (const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
  return n;
}
function ex(col, row) { return { x: colNum(col) - 1, y: row - 1 }; }

const BOSSES_RAW = [
  { name:'Dragon White',  level:7, icon:'🐉', colour:'#FFFFFF', ...ex('AQ',133) },
  { name:'Dragon Black',  level:7, icon:'🐉', colour:'#AAAAAA', ...ex('CK',30)  },
  { name:'Dragon Red',    level:6, icon:'🐉', colour:'#FF3333', ...ex('O', 70)   },
  { name:'Dragon Yellow', level:6, icon:'🐉', colour:'#FFD700', ...ex('GP',78)   },
  { name:'Anansi',        level:6, icon:'🕷',  colour:'#C68642', ...ex('DK',140) },
  { name:'Epimetheus',    level:6, icon:'⚡',  colour:'#9B59B6', ...ex('JZ',72)  },
  { name:'Nian',          level:6, icon:'🦁',  colour:'#E74C3C', ...ex('BF',36)  },
  { name:'Suku-na-biko',  level:6, icon:'✨',  colour:'#F39C12', ...ex('FT',51)  },
  { name:'Cthulhu',       level:7, icon:'🐙',  colour:'#27AE60', ...ex('IE',117) },
  { name:'Ghost Whale',   level:5, icon:'🐋',  colour:'#AED6F1', ...ex('HL',5)   },
];

/* ══════════════════════════════════════════════════════════════════════
   MAP DATA
══════════════════════════════════════════════════════════════════════ */
if (typeof MAP_DATA === 'undefined') {
  const msg =
    'MAP_DATA not found!\n\n' +
    '1. Copy pasted-text.txt  →  mapdata.js\n' +
    '2. Change the first line:\n' +
    '       const map = [\n' +
    '   to:\n' +
    '       const MAP_DATA = [';
  document.body.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100vh;background:#07070a;color:#e8c87a;font:14px monospace;white-space:pre;text-align:center;';
  document.body.textContent = msg;
  throw new Error(msg);
}

const map   = MAP_DATA.map(row => row.map(k => (BIOMES[k] ? k : 'plains')));
const MAP_H = map.length;
const MAP_W = map[0].length;

const BOSSES = BOSSES_RAW.filter(b => b.x >= 0 && b.x < MAP_W && b.y >= 0 && b.y < MAP_H);
const BOSS_AT = new Map(BOSSES.map(b => [`${b.x},${b.y}`, b]));

// Chunk grid dimensions
const CHUNKS_X = Math.ceil(MAP_W / CHUNK_SIZE);
const CHUNKS_Y = Math.ceil(MAP_H / CHUNK_SIZE);

/* ══════════════════════════════════════════════════════════════════════
   FOG OF WAR
══════════════════════════════════════════════════════════════════════ */
const fog = Array.from({ length: MAP_H }, () => new Uint8Array(MAP_W));

function reveal(cx, cy, r = 3) {
  for (let j = -r; j <= r; j++) {
    for (let i = -r; i <= r; i++) {
      const tx = cx + i, ty = cy + j;
      if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) continue;
      fog[ty][tx] = Math.max(fog[ty][tx], Math.sqrt(i*i+j*j) <= r ? 2 : 1);
    }
  }
}

const CX = Math.floor(MAP_W / 2);
const CY = Math.floor(MAP_H / 2);
reveal(CX, CY, 10);

/* ══════════════════════════════════════════════════════════════════════
   SVG PATTERN HELPERS  (shared between canvas renderer & CSS injector)
══════════════════════════════════════════════════════════════════════ */
function getSVGInnerMarkup(key, b) {
  const hi = b.hi;
  const patterns = {
    vulcan3:
      `<line x1="25" y1="48" x2="30" y2="14" stroke="${hi}" stroke-width="2"   opacity=".62"/>
       <line x1="30" y1="14" x2="44" y2="36" stroke="${hi}" stroke-width="1.5" opacity=".48"/>
       <line x1="6"  y1="32" x2="22" y2="44" stroke="#FF4500" stroke-width="1.5" opacity=".42"/>
       <circle cx="30" cy="14" r="6" fill="${hi}" opacity=".36"/>`,
    water:
      `<path d="M0,17 Q12,11 24,17 T48,17" stroke="${hi}" stroke-width="2"   fill="none" opacity=".36"/>
       <path d="M0,29 Q12,23 24,29 T48,29" stroke="${hi}" stroke-width="1.5" fill="none" opacity=".26"/>
       <path d="M0,41 Q12,35 24,41 T48,41" stroke="${hi}" stroke-width="1"   fill="none" opacity=".16"/>`,
    water1:
      `<path d="M0,14 Q12,8  24,14 T48,14" stroke="${hi}" stroke-width="2.5" fill="none" opacity=".36"/>
       <path d="M0,27 Q12,21 24,27 T48,27" stroke="${hi}" stroke-width="2"   fill="none" opacity=".26"/>
       <path d="M0,40 Q12,34 24,40 T48,40" stroke="${hi}" stroke-width="1.5" fill="none" opacity=".18"/>`,
    water2:
      `<path d="M0,11 Q12,4  24,13 T48,11" stroke="${hi}" stroke-width="3"   fill="none" opacity=".30"/>
       <path d="M0,26 Q12,19 24,28 T48,26" stroke="${hi}" stroke-width="2.5" fill="none" opacity=".22"/>
       <path d="M0,41 Q12,34 24,43 T48,41" stroke="${hi}" stroke-width="2"   fill="none" opacity=".15"/>
       <circle cx="10" cy="37" r="3.5" fill="${hi}" opacity=".12"/>`,
    meadows:
      `<circle cx="10" cy="15" r="3.5" fill="${hi}" opacity=".36"/>
       <circle cx="32" cy="10" r="2.5" fill="${hi}" opacity=".28"/>
       <circle cx="44" cy="28" r="3"   fill="${hi}" opacity=".36"/>
       <circle cx="18" cy="40" r="2.5" fill="${hi}" opacity=".28"/>
       <circle cx="42" cy="43" r="2"   fill="${hi}" opacity=".22"/>`,
    swamp:
      `<ellipse cx="14" cy="19" rx="8"  ry="5" stroke="${hi}" stroke-width="1.5" fill="none" opacity=".35"/>
       <ellipse cx="36" cy="34" rx="10" ry="6" stroke="${hi}" stroke-width="1.5" fill="none" opacity=".28"/>
       <ellipse cx="24" cy="43" rx="7"  ry="4" stroke="${hi}" stroke-width="1"   fill="none" opacity=".22"/>
       <line x1="14" y1="10" x2="14" y2="28" stroke="${hi}" stroke-width="1.2" opacity=".24"/>`,
    forest:
      `<polygon points="24,5 16,22 32,22"  fill="${hi}" opacity=".34"/>
       <polygon points="10,18 3,34 17,34"  fill="${hi}" opacity=".26"/>
       <polygon points="40,15 33,31 47,31" fill="${hi}" opacity=".26"/>`,
    forest2:
      `<polygon points="24,4 15,23 33,23"  fill="${hi}" opacity=".36"/>
       <polygon points="9,14 1,32 17,32"   fill="${hi}" opacity=".28"/>
       <polygon points="41,12 33,31 49,31" fill="${hi}" opacity=".28"/>
       <polygon points="24,23 17,36 31,36" fill="${hi}" opacity=".22"/>`,
    forest3:
      `<polygon points="24,3 14,25 34,25"  fill="${hi}" opacity=".38"/>
       <polygon points="8,13 0,33 16,33"  fill="${hi}" opacity=".30"/>
       <polygon points="42,10 34,30 50,30" fill="${hi}" opacity=".30"/>
       <polygon points="24,24 16,39 32,39" fill="${hi}" opacity=".24"/>
       <polygon points="15,38 9,48 21,48"  fill="${hi}" opacity=".18"/>`,
    mountain1:
      `<polygon points="24,5 6,43 42,43"  fill="${hi}" opacity=".20"/>
       <polygon points="24,5 16,24 32,24" fill="#ECEFF1" opacity=".50"/>`,
    mountains2:
      `<polygon points="24,3 4,45 44,45"   fill="${hi}" opacity=".24"/>
       <polygon points="24,3 14,24 34,24"  fill="#ECEFF1" opacity=".54"/>
       <polygon points="14,45 8,37 20,37"  fill="${hi}" opacity=".18"/>`,
    snow3:
      `<line x1="24" y1="7"  x2="24" y2="41" stroke="white" stroke-width="1.5" opacity=".52"/>
       <line x1="7"  y1="24" x2="41" y2="24" stroke="white" stroke-width="1.5" opacity=".52"/>
       <line x1="13" y1="13" x2="35" y2="35" stroke="white" stroke-width="1"   opacity=".36"/>
       <line x1="35" y1="13" x2="13" y2="35" stroke="white" stroke-width="1"   opacity=".36"/>`,
    plains:
      `<line x1="3" y1="16" x2="45" y2="18" stroke="${hi}" stroke-width="1.5" opacity=".32"/>
       <line x1="3" y1="28" x2="45" y2="30" stroke="${hi}" stroke-width="1"   opacity=".24"/>
       <line x1="3" y1="40" x2="45" y2="42" stroke="${hi}" stroke-width="1"   opacity=".18"/>`,
    plains1:
      `<line x1="3" y1="13" x2="45" y2="15" stroke="${hi}" stroke-width="2"   opacity=".34"/>
       <line x1="3" y1="25" x2="45" y2="27" stroke="${hi}" stroke-width="1.5" opacity=".26"/>
       <line x1="3" y1="37" x2="45" y2="39" stroke="${hi}" stroke-width="1"   opacity=".20"/>
       <circle cx="38" cy="10" r="3" fill="${hi}" opacity=".24"/>`,
    plain2:
      `<line x1="3" y1="11" x2="45" y2="13" stroke="${hi}" stroke-width="2.5" opacity=".34"/>
       <line x1="3" y1="22" x2="45" y2="24" stroke="${hi}" stroke-width="2"   opacity=".28"/>
       <line x1="3" y1="33" x2="45" y2="35" stroke="${hi}" stroke-width="1.5" opacity=".22"/>
       <line x1="3" y1="44" x2="45" y2="46" stroke="${hi}" stroke-width="1"   opacity=".16"/>`,
    desert:
      `<ellipse cx="24" cy="32" rx="20" ry="6"  fill="${hi}" opacity=".20"/>
       <ellipse cx="14" cy="18" rx="11" ry="4"  fill="${hi}" opacity=".14"/>`,
    desert1:
      `<ellipse cx="24" cy="30" rx="21" ry="7"  fill="${hi}" opacity=".25"/>
       <ellipse cx="13" cy="16" rx="12" ry="5"  fill="${hi}" opacity=".18"/>
       <line x1="3" y1="43" x2="45" y2="45" stroke="${hi}" stroke-width="1" opacity=".24"/>`,
  };
  return patterns[key] || '';
}

/* ══════════════════════════════════════════════════════════════════════
   CSS INJECTION  (for detail-mode DOM tiles)
══════════════════════════════════════════════════════════════════════ */
function injectBiomeCSS() {
  const lines = [];
  for (const [key, b] of Object.entries(BIOMES)) {
    const svgBody = getSVGInnerMarkup(key, b);
    const svgStr  = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_PX}" height="${TILE_PX}">${svgBody}</svg>`;
    const uri     = encodeURIComponent(svgStr);
    lines.push(
      `.tile[data-biome="${key}"]{` +
      `background:url("data:image/svg+xml,${uri}") center/${TILE_PX}px ${TILE_PX}px no-repeat,` +
      `linear-gradient(135deg,${b.base},${b.dark});}`
    );
  }
  const s = document.createElement('style');
  s.textContent = lines.join('');
  document.head.appendChild(s);
}

/* ══════════════════════════════════════════════════════════════════════
   PRE-RENDERED SVG IMAGES  (one Image object per biome, for canvas use)
══════════════════════════════════════════════════════════════════════ */
const biomeImages = {};   // key → HTMLImageElement (may still be loading)
const biomeImagesReady = {}; // key → bool

function preloadBiomeImages() {
  for (const [key, b] of Object.entries(BIOMES)) {
    const svgBody = getSVGInnerMarkup(key, b);
    const svgStr  = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_PX}" height="${TILE_PX}">${svgBody}</svg>`;
    const img = new Image(TILE_PX, TILE_PX);
    img.onload = () => { biomeImagesReady[key] = true; };
    img.src = 'data:image/svg+xml,' + encodeURIComponent(svgStr);
    biomeImages[key] = img;
  }
}

/* ══════════════════════════════════════════════════════════════════════
   CHUNK CANVAS RENDERER
   Each chunk is a CHUNK_SIZE × CHUNK_SIZE tile grid painted to a canvas.
   The canvas is converted to a data-URL <img> once, then reused.
   Fog changes invalidate the affected chunks so they repaint on next sync.
══════════════════════════════════════════════════════════════════════ */
const chunkCache   = new Map();   // "cx,cy" → { img, fogHash }
const activeChunks = new Map();   // "cx,cy" → img element in DOM

// Compute a cheap fog hash for a chunk to detect changes
function chunkFogHash(cx, cy) {
  const tx0 = cx * CHUNK_SIZE, ty0 = cy * CHUNK_SIZE;
  const tx1 = Math.min(tx0 + CHUNK_SIZE, MAP_W);
  const ty1 = Math.min(ty0 + CHUNK_SIZE, MAP_H);
  let h = 0;
  for (let ty = ty0; ty < ty1; ty++)
    for (let tx = tx0; tx < tx1; tx++)
      h = (h * 31 + fog[ty][tx]) | 0;
  return h;
}

function renderChunkToDataURL(cx, cy) {
  const tx0 = cx * CHUNK_SIZE, ty0 = cy * CHUNK_SIZE;
  const tx1 = Math.min(tx0 + CHUNK_SIZE, MAP_W);
  const ty1 = Math.min(ty0 + CHUNK_SIZE, MAP_H);
  const pw   = (tx1 - tx0) * TILE_PX;
  const ph   = (ty1 - ty0) * TILE_PX;

  const canvas = document.createElement('canvas');
  canvas.width  = pw;
  canvas.height = ph;
  const ctx = canvas.getContext('2d');

  for (let ty = ty0; ty < ty1; ty++) {
    for (let tx = tx0; tx < tx1; tx++) {
      const lx = (tx - tx0) * TILE_PX;
      const ly = (ty - ty0) * TILE_PX;
      const key = map[ty][tx];
      const b   = BIOMES[key];
      const f   = fog[ty][tx];

      if (f === 0) {
        // Fully dark — just black
        ctx.fillStyle = '#000000';
        ctx.fillRect(lx, ly, TILE_PX, TILE_PX);
        continue;
      }

      // Draw gradient background
      const grad = ctx.createLinearGradient(lx, ly, lx + TILE_PX, ly + TILE_PX);
      grad.addColorStop(0, b.base);
      grad.addColorStop(1, b.dark);
      ctx.fillStyle = grad;
      ctx.fillRect(lx, ly, TILE_PX, TILE_PX);

      // Draw SVG pattern overlay (if image loaded)
      if (biomeImagesReady[key]) {
        ctx.drawImage(biomeImages[key], lx, ly, TILE_PX, TILE_PX);
      }

      // Fog overlay
      if (f === 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(lx, ly, TILE_PX, TILE_PX);
      }
    }
  }

  return canvas.toDataURL('image/png');
}

function getOrBuildChunk(cx, cy) {
  const key  = `${cx},${cy}`;
  const hash = chunkFogHash(cx, cy);
  const cached = chunkCache.get(key);
  if (cached && cached.fogHash === hash) return cached.dataURL;

  const dataURL = renderChunkToDataURL(cx, cy);
  chunkCache.set(key, { dataURL, fogHash: hash });
  return dataURL;
}

/* ══════════════════════════════════════════════════════════════════════
   DETAIL TILE POOL  (only used at high zoom)
══════════════════════════════════════════════════════════════════════ */
const activeTiles = new Map();
const tilePool    = [];

function makeTileEl(tx, ty) {
  const el   = tilePool.length ? tilePool.pop() : document.createElement('div');
  const boss = BOSS_AT.get(`${tx},${ty}`);

  el.className     = 'tile';
  el.style.cssText = `left:${tx * TILE_PX}px;top:${ty * TILE_PX}px;width:${TILE_PX}px;height:${TILE_PX}px;`;
  el.dataset.biome = map[ty][tx];
  el.dataset.fog   = fog[ty][tx];
  el.dataset.tx    = tx;
  el.dataset.ty    = ty;
  el.innerHTML     = '';

  if (boss) {
    const bm       = document.createElement('div');
    bm.className   = 'boss-marker';
    bm.textContent = boss.icon;
    bm.style.color = boss.colour;
    el.appendChild(bm);
  }

  const lbl       = document.createElement('div');
  lbl.className   = 'tile-label';
  lbl.textContent = `${tx},${ty}`;
  el.appendChild(lbl);

  return el;
}

function dropTile(key) {
  const el = activeTiles.get(key);
  if (!el) return;
  tileLayer.removeChild(el);
  tilePool.push(el);
  activeTiles.delete(key);
}

function clearAllTiles() {
  for (const key of [...activeTiles.keys()]) dropTile(key);
}

/* ══════════════════════════════════════════════════════════════════════
   CAMERA
══════════════════════════════════════════════════════════════════════ */
let panX = 0, panY = 0, zoom = 1;

/* ══════════════════════════════════════════════════════════════════════
   LAYER ELEMENTS
   chunkLayer  — always visible, holds chunk <img>s
   tileLayer   — visible only at DETAIL_ZOOM+, holds individual .tile divs
   bossLayer   — boss markers at all zoom levels (above DETAIL_ZOOM bosses
                 are shown in tileLayer; below, we place them in bossLayer)
══════════════════════════════════════════════════════════════════════ */
const chunkLayer = document.createElement('div');
chunkLayer.id = 'chunk-layer';
chunkLayer.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
world.appendChild(chunkLayer);

const tileLayer = document.createElement('div');
tileLayer.id = 'tile-layer';
tileLayer.style.cssText = 'position:absolute;top:0;left:0;';
world.appendChild(tileLayer);

// Re-target activeTiles/tilePool ops to tileLayer
function makeTileElInLayer(tx, ty) {
  const el = makeTileEl(tx, ty);
  return el; // will be appended to tileLayer
}

/* ══════════════════════════════════════════════════════════════════════
   SYNC — main render loop entry
══════════════════════════════════════════════════════════════════════ */
let _rafId = 0;
let _lastMode = null; // 'chunks' | 'detail'

function scheduleSync() {
  if (_rafId) return;
  _rafId = requestAnimationFrame(() => { syncViewport(); _rafId = 0; });
}

// Track last viewport for chunk sync
let _vcx0 = -1, _vcy0 = -1, _vcx1 = -1, _vcy1 = -1;
// Track last viewport for tile sync
let _vx0 = -1, _vy0 = -1, _vx1 = -1, _vy1 = -1;

function syncViewport() {
  const vw = viewport.clientWidth, vh = viewport.clientHeight;
  const mode = zoom >= DETAIL_ZOOM ? 'detail' : 'chunks';

  if (mode === 'chunks') {
    // ── CHUNK MODE ───────────────────────────────────────────────────
    // Hide tile layer
    tileLayer.style.display = 'none';
    chunkLayer.style.display = '';

    // Clear detail tiles if we just switched
    if (_lastMode === 'detail') {
      clearAllTiles();
      _vx0 = _vy0 = _vx1 = _vy1 = -1;
    }
    _lastMode = 'chunks';

    // Visible chunk range
    const cx0 = Math.max(0,       Math.floor(-panX / zoom / CHUNK_PX) - PADDING);
    const cy0 = Math.max(0,       Math.floor(-panY / zoom / CHUNK_PX) - PADDING);
    const cx1 = Math.min(CHUNKS_X, Math.ceil((-panX / zoom + vw / zoom) / CHUNK_PX) + PADDING);
    const cy1 = Math.min(CHUNKS_Y, Math.ceil((-panY / zoom + vh / zoom) / CHUNK_PX) + PADDING);

    if (cx0 === _vcx0 && cy0 === _vcy0 && cx1 === _vcx1 && cy1 === _vcy1) return;
    _vcx0 = cx0; _vcy0 = cy0; _vcx1 = cx1; _vcy1 = cy1;

    // Remove out-of-range chunks
    for (const [key, img] of [...activeChunks.entries()]) {
      const [ccx, ccy] = key.split(',').map(Number);
      if (ccx < cx0 || ccx >= cx1 || ccy < cy0 || ccy >= cy1) {
        chunkLayer.removeChild(img);
        activeChunks.delete(key);
      }
    }

    // Add new in-range chunks
    for (let ccy = cy0; ccy < cy1; ccy++) {
      for (let ccx = cx0; ccx < cx1; ccx++) {
        const key = `${ccx},${ccy}`;
        if (activeChunks.has(key)) {
          // Check if fog changed — if so, rebuild and update src
          const fogHash = chunkFogHash(ccx, ccy);
          const cached  = chunkCache.get(key);
          if (!cached || cached.fogHash !== fogHash) {
            const img = activeChunks.get(key);
            img.src = getOrBuildChunk(ccx, ccy);
          }
          continue;
        }
        const img = document.createElement('img');
        img.style.cssText =
          `position:absolute;` +
          `left:${ccx * CHUNK_PX}px;top:${ccy * CHUNK_PX}px;` +
          `width:${Math.min(CHUNK_PX, (MAP_W - ccx * CHUNK_SIZE) * TILE_PX)}px;` +
          `height:${Math.min(CHUNK_PX, (MAP_H - ccy * CHUNK_SIZE) * TILE_PX)}px;` +
          `image-rendering:pixelated;`;
        img.src = getOrBuildChunk(ccx, ccy);
        chunkLayer.appendChild(img);
        activeChunks.set(key, img);
      }
    }

    // Boss markers in chunk mode — show as overlay divs on bossLayer
    syncBossOverlays();

  } else {
    // ── DETAIL MODE ─────────────────────────────────────────────────
    tileLayer.style.display = '';
    chunkLayer.style.display = 'none';
    clearBossOverlays();

    if (_lastMode === 'chunks') {
      _vcx0 = _vcy0 = _vcx1 = _vcy1 = -1; // force chunk re-eval on next switch back
    }
    _lastMode = 'detail';

    const TILE_PAD = 2;
    const x0 = Math.max(0,     Math.floor(-panX / zoom / TILE_PX) - TILE_PAD);
    const y0 = Math.max(0,     Math.floor(-panY / zoom / TILE_PX) - TILE_PAD);
    const x1 = Math.min(MAP_W, Math.ceil((-panX / zoom + vw / zoom) / TILE_PX) + TILE_PAD);
    const y1 = Math.min(MAP_H, Math.ceil((-panY / zoom + vh / zoom) / TILE_PX) + TILE_PAD);

    if (x0 === _vx0 && y0 === _vy0 && x1 === _vx1 && y1 === _vy1) return;
    _vx0 = x0; _vy0 = y0; _vx1 = x1; _vy1 = y1;

    // Drop tiles out of range
    for (const [key] of [...activeTiles.entries()]) {
      const [tx, ty] = key.split(',').map(Number);
      if (tx < x0 || tx >= x1 || ty < y0 || ty >= y1) dropTile(key);
    }

    // Add new tiles
    const frag = document.createDocumentFragment();
    for (let ty = y0; ty < y1; ty++) {
      for (let tx = x0; tx < x1; tx++) {
        const key = `${tx},${ty}`;
        if (activeTiles.has(key)) continue;
        const el = makeTileElInLayer(tx, ty);
        frag.appendChild(el);
        activeTiles.set(key, el);
      }
    }
    tileLayer.appendChild(frag);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   BOSS OVERLAYS  (chunk mode only — emoji markers over chunks)
══════════════════════════════════════════════════════════════════════ */
const bossLayer = document.createElement('div');
bossLayer.id = 'boss-layer';
bossLayer.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
world.appendChild(bossLayer);

let bossOverlaysBuilt = false;

function syncBossOverlays() {
  // Rebuild from scratch each time fog may have changed
  bossLayer.innerHTML = '';
  bossLayer.style.display = '';
  for (const boss of BOSSES) {
    if (fog[boss.y][boss.x] === 0) continue;
    const el = document.createElement('div');
    el.className   = 'boss-marker';
    el.textContent = boss.icon;
    el.style.cssText =
      `position:absolute;` +
      `left:${boss.x * TILE_PX}px;top:${boss.y * TILE_PX}px;` +
      `width:${TILE_PX}px;height:${TILE_PX}px;` +
      `display:flex;align-items:center;justify-content:center;font-size:26px;z-index:2;` +
      `color:${boss.colour};`;
    bossLayer.appendChild(el);
  }
}

function clearBossOverlays() {
  bossLayer.style.display = 'none';
}

/* ══════════════════════════════════════════════════════════════════════
   FOG REFRESH
══════════════════════════════════════════════════════════════════════ */
function refreshFog() {
  // Invalidate all cached chunk images so they repaint with new fog
  chunkCache.clear();
  // Force chunk range recalculation on next sync
  _vcx0 = _vcy0 = _vcx1 = _vcy1 = -1;
  _vx0  = _vy0  = _vx1  = _vy1  = -1;
  // Update any currently visible detail tiles
  for (const [, el] of activeTiles) {
    const f = fog[+el.dataset.ty][+el.dataset.tx];
    if (el.dataset.fog !== String(f)) el.dataset.fog = f;
  }
  scheduleSync();
}

/* ══════════════════════════════════════════════════════════════════════
   LEGEND
══════════════════════════════════════════════════════════════════════ */
function buildLegend() {
  const c = document.getElementById('legend-items');
  for (const [key, b] of Object.entries(BIOMES)) {
    const d = document.createElement('div');
    d.className = 'legend-item';
    d.innerHTML =
      `<div class="legend-swatch" style="background:linear-gradient(135deg,${b.base},${b.dark})"></div>` +
      `<span>${b.label}</span>`;
    c.appendChild(d);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   TRANSFORM
══════════════════════════════════════════════════════════════════════ */
function applyTransform() {
  world.style.transform = `translate(${panX}px,${panY}px) scale(${zoom})`;
  elZoomVal.textContent = zoom.toFixed(2);
  viewport.style.setProperty('--label-display', zoom > 2.5 ? 'block' : 'none');
}

/* ══════════════════════════════════════════════════════════════════════
   FIT MAP
══════════════════════════════════════════════════════════════════════ */
function fitMap() {
  zoom = Math.min(
    (viewport.clientWidth  * 0.97) / (MAP_W * TILE_PX),
    (viewport.clientHeight * 0.97) / (MAP_H * TILE_PX)
  );
  zoom = Math.max(0.04, zoom);
  panX = (viewport.clientWidth  - MAP_W * TILE_PX * zoom) / 2;
  panY = (viewport.clientHeight - MAP_H * TILE_PX * zoom) / 2;
  applyTransform();
  scheduleSync();
}

/* ══════════════════════════════════════════════════════════════════════
   TOOLTIP
══════════════════════════════════════════════════════════════════════ */
function showTooltip(sx, sy) {
  const tx = Math.floor((sx - panX) / zoom / TILE_PX);
  const ty = Math.floor((sy - panY) / zoom / TILE_PX);

  if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H || fog[ty][tx] === 0) {
    tooltip.classList.remove('show'); return;
  }
  const bKey = map[ty][tx];
  const b    = BIOMES[bKey];
  const enc  = (ENCOUNTERS[bKey] || []).slice(0, 3).map(([n, p]) => `${n} ${p}%`).join(' · ');
  const boss = BOSS_AT.get(`${tx},${ty}`);
  const bTag = boss
    ? `<span class="sep">│</span><span class="boss-text">${boss.icon} ${boss.name} Lv${boss.level}</span>`
    : '';

  tooltip.innerHTML =
    `<strong>${b.label}</strong>` +
    `<span class="sep">│</span>[${tx},${ty}]` +
    `<span class="sep">│</span>⚠ ${(b.danger * 100) | 0}%` +
    `<span class="sep">│</span>${enc}${bTag}`;
  tooltip.classList.add('show');
}

/* ══════════════════════════════════════════════════════════════════════
   INPUT
══════════════════════════════════════════════════════════════════════ */
let _drag = false, _ox = 0, _oy = 0, _moved = false;

viewport.addEventListener('contextmenu', e => e.preventDefault());

viewport.addEventListener('mousedown', e => {
  _drag = true; _moved = false;
  _ox = e.clientX - panX; _oy = e.clientY - panY;
  viewport.classList.add('dragging');
});
window.addEventListener('mouseup', e => {
  if (_drag && !_moved) handleClick(e.clientX, e.clientY);
  _drag = false; viewport.classList.remove('dragging');
});
window.addEventListener('mousemove', e => {
  if (_drag) {
    panX = e.clientX - _ox; panY = e.clientY - _oy;
    _moved = true; applyTransform(); scheduleSync();
  }
  showTooltip(e.clientX, e.clientY);
});
viewport.addEventListener('mouseleave', () => tooltip.classList.remove('show'));

viewport.addEventListener('wheel', e => {
  e.preventDefault();
  const f  = e.deltaY > 0 ? 0.88 : 1.14;
  const nz = Math.max(0.04, Math.min(6, zoom * f));
  panX = e.clientX - (e.clientX - panX) * (nz / zoom);
  panY = e.clientY - (e.clientY - panY) * (nz / zoom);
  zoom = nz; applyTransform(); scheduleSync();
}, { passive: false });

// Touch
let _tp = 0, _tMoved = false;
viewport.addEventListener('touchstart', e => {
  e.preventDefault();
  if (e.touches.length === 1) {
    _drag = true; _tMoved = false;
    _ox = e.touches[0].clientX - panX; _oy = e.touches[0].clientY - panY;
  } else if (e.touches.length === 2) {
    _drag = false;
    _tp = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
  }
}, { passive: false });

viewport.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 1 && _drag) {
    panX = e.touches[0].clientX - _ox; panY = e.touches[0].clientY - _oy;
    _tMoved = true; applyTransform(); scheduleSync();
  } else if (e.touches.length === 2) {
    const d  = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    const nz = Math.max(0.04, Math.min(6, zoom * d / _tp));
    panX = cx - (cx - panX) * (nz / zoom);
    panY = cy - (cy - panY) * (nz / zoom);
    zoom = nz; _tp = d; applyTransform(); scheduleSync();
  }
}, { passive: false });

viewport.addEventListener('touchend', e => {
  if (_drag && !_tMoved) handleClick(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
  _drag = false;
});

window.addEventListener('resize', () => scheduleSync());

function handleClick(sx, sy) {
  const tx = Math.floor((sx - panX) / zoom / TILE_PX);
  const ty = Math.floor((sy - panY) / zoom / TILE_PX);
  if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return;
  reveal(tx, ty, 3);
  refreshFog();
}

/* ══════════════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════════════ */
world.style.width  = `${MAP_W * TILE_PX}px`;
world.style.height = `${MAP_H * TILE_PX}px`;
world.style.transformOrigin = '0 0';

zoom = 0.25;
panX = viewport.clientWidth  / 2 - CX * TILE_PX * zoom;
panY = viewport.clientHeight / 2 - CY * TILE_PX * zoom;

preloadBiomeImages();
injectBiomeCSS();
buildLegend();
applyTransform();

// Wait one frame so layout is settled, then do the first sync
// (also lets biome images start loading — canvas fallback gradient still shows instantly)
requestAnimationFrame(() => {
  syncViewport();
});
