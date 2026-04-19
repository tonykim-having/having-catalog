
const PRIMARY_DATA_URL =
  window.CATALOG_DATA_URL ||
  'https://script.google.com/macros/s/AKfycbxg937uz2NriahqW40S_SKxiFksqgyMjDA3js-500sRKVIGFg_9qVsKlRwk-VN34SsTyA/exec';

const INQUIRY_URL = window.CATALOG_INQUIRY_URL || PRIMARY_DATA_URL;

let BM = {};
let BORDER = [];
let FILTERS = [];
let COMPANY = {};
let PRODUCTS_CACHE = {};

const DEFAULT_FILTERS = [{ id: 'all', label: 'All Brands' }];

let activeFilter = 'all';
let currentBrand = null;
let currentSkuFilter = 'All';
let savedScrollY = 0;
let scrollLockCount = 0;

const inquiryState = { brands: [], products: [] };

let loadingProgress = 0;
let loadingTimer = null;

function splitMulti(value) {
  if (Array.isArray(value)) return value.filter(v => v !== '' && v != null);
  if (value == null) return [];
  const str = String(value).trim();
  if (!str) return [];
  return str.split('|').map(v => v.trim()).filter(Boolean);
}

function asText(value, fallback = '') {
  if (value == null) return fallback;
  return String(value).trim();
}

function asNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function pick(obj, keys, fallback = '') {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== '') {
      return obj[key];
    }
  }
  return fallback;
}

function slugify(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function slugifyFilter(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function uniq(arr) {
  return [...new Set(arr)];
}

/* =========================
   LOADING OVERLAY (reuse same layer / fade flow)
========================= */
function setLoadingText(text) {
  const el = document.getElementById('loadingText');
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => {
    el.textContent = text;
    el.style.opacity = '1';
  }, 220);
}

function setLoadingProgress(value) {
  loadingProgress = Math.max(0, Math.min(100, value));
  const el = document.getElementById('loadingBarFill');
  if (el) el.style.width = `${loadingProgress}%`;
}

function showLoadingOverlay(initialText = 'Connecting to catalog data...') {
  const layer = document.getElementById('loadingLayer');
  if (!layer) return;
  layer.classList.remove('hidden');
  layer.style.display = '';
  setLoadingText(initialText);
  setLoadingProgress(8);
  if (loadingTimer) clearInterval(loadingTimer);
  loadingTimer = setInterval(() => {
    if (loadingProgress < 60) setLoadingProgress(loadingProgress + 4);
    else if (loadingProgress < 78) setLoadingProgress(loadingProgress + 1);
  }, 180);
}

function hideLoadingOverlay() {
  const layer = document.getElementById('loadingLayer');
  if (!layer) return;
  if (loadingTimer) clearInterval(loadingTimer);
  setLoadingProgress(100);
  setLoadingText('Almost ready...');
  setTimeout(() => {
    layer.classList.add('hidden');
  }, 180);
}

/* =========================
   FETCH
========================= */
async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  return res.json();
}

function normalizeBrandsPayload(payload) {
  const brandRows = Array.isArray(payload?.brands) ? payload.brands : [];
  const BMOut = {};
  const BORDEROut = [];

  brandRows.forEach((row, index) => {
    const id = asText(pick(row, ['brand_id', 'id', 'slug'])) || slugify(pick(row, ['name'], `brand-${index + 1}`));
    if (!id) return;

    const rawFilters = splitMulti(pick(row, ['filters', 'filter_tags', 'category_primary']))
      .flatMap(v => String(v).split(','))
      .map(v => v.trim())
      .filter(Boolean);

    const markets = splitMulti(pick(row, ['active_markets', 'markets']))
      .flatMap(v => String(v).split(','))
      .map(v => v.trim())
      .filter(Boolean);

    const supply = splitMulti(pick(row, ['supply_mode', 'supply', 'pb_available']))
      .flatMap(v => String(v).split('|'))
      .map(v => String(v).trim())
      .filter(Boolean)
      .map(v => (v.toLowerCase() === 'true' ? 'Private Label' : v));

    const totalSku = asNumber(pick(row, ['total_sku']), 0);

    BMOut[id] = {
      brand_id: id,
      name: asText(pick(row, ['name'])),
      accent: asText(pick(row, ['accent_color', 'accent']), '#111110'),
      tag: asText(pick(row, ['short_description', 'tag'])),
      about: asText(pick(row, ['full_description', 'about', 'description'])),
      hashtags: splitMulti(pick(row, ['hashtags', 'key_claims'])),
      filterTags: uniq(rawFilters.map(slugifyFilter).filter(Boolean)),
      supply: supply.length ? supply : ['Brand Supply'],
      channel: asText(pick(row, ['channel', 'target_channel'])),
      totalSku,
      tech: [],
      filters: uniq(['All', ...rawFilters]).filter(Boolean),
      markets,
      exclusivity: {
        status: asText(pick(row, ['exclusivity', 'exclusivity_status']), 'Case by Case'),
        note: asText(pick(row, ['exclusivity_note', 'note']))
      },
      listImage: asText(pick(row, ['list_image_url', 'list_image', 'listImage', 'hero_image_url'])),
      bgImage: asText(pick(row, ['hero_image_url', 'bg_image', 'bgImage', 'list_image_url']))
    };

    BORDEROut.push(id);
  });

  const allFilterTags = uniq(BORDEROut.flatMap(id => (BMOut[id]?.filterTags || []).filter(Boolean)));
  const FILTERSOut = [{ id: 'all', label: 'All Brands' }].concat(
    allFilterTags.map(id => ({
      id,
      label: id.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
    }))
  );

  return { BM: BMOut, BORDER: BORDEROut, FILTERS: FILTERSOut.length > 1 ? FILTERSOut : DEFAULT_FILTERS };
}

function normalizeCompanyPayload(payload) {
  const company = payload?.company || {};
  return {
    name: asText(pick(company, ['name']), 'HAVING Corp.'),
    hero_eyebrow: asText(pick(company, ['hero_eyebrow']), 'Curated Brand Portfolio'),
    hero_title: asText(pick(company, ['hero_title']), 'Built for <em>distribution</em>, private label, and market entry.'),
    email: asText(pick(company, ['email']), 'having@having.co.kr'),
    address: asText(pick(company, ['address']), ''),
    contact_title: asText(pick(company, ['contact_title']), 'Sales Representative'),
    phone: asText(pick(company, ['phone'])),
    logo_url: asText(pick(company, ['logo_url']))
  };
}

function normalizeProductsPayload(payload) {
  const rows = Array.isArray(payload?.products) ? payload.products : [];
  return rows.map(row => ({
    id: asText(pick(row, ['sku', 'id'])),
    b: asText(pick(row, ['brand_id', 'brandId'])),
    name: asText(pick(row, ['name'])),
    vol: asText(pick(row, ['volume', 'vol'])),
    type: asText(pick(row, ['type'])),
    tags: splitMulti(pick(row, ['subtitle', 'tags'])),
    keys: splitMulti(pick(row, ['ingredients', 'keys'])),
    feats: splitMulti(pick(row, ['features', 'feats'])),
    moq: asText(pick(row, ['moq']), 'Contact'),
    lead: asText(pick(row, ['lead_time', 'lead']), 'Contact'),
    terms: asText(pick(row, ['terms']), 'Contact'),
    desc: asText(pick(row, ['product_description', 'desc'])),
    certs: splitMulti(pick(row, ['certifications', 'certs'])),
    img: asText(pick(row, ['image_url', 'img', 'image']))
  })).filter(p => p.id && p.b);
}

function applyCatalogData(data) {
  BM = data.BM || {};
  BORDER = data.BORDER || [];
  FILTERS = data.FILTERS || DEFAULT_FILTERS;
  COMPANY = data.COMPANY || {};
}

async function fetchBrandsAndCompany() {
  const [brandsPayload, companyPayload] = await Promise.all([
    fetchJson(`${PRIMARY_DATA_URL}?type=brands`),
    fetchJson(`${PRIMARY_DATA_URL}?type=company`)
  ]);
  return {
    ...normalizeBrandsPayload(brandsPayload),
    COMPANY: normalizeCompanyPayload(companyPayload)
  };
}

async function loadBrandProducts(brandId) {
  if (!brandId) return [];
  if (PRODUCTS_CACHE[brandId]) return PRODUCTS_CACHE[brandId];
  const payload = await fetchJson(`${PRIMARY_DATA_URL}?type=products&brand_id=${encodeURIComponent(brandId)}`);
  const products = normalizeProductsPayload(payload);
  PRODUCTS_CACHE[brandId] = products;
  return products;
}

/* =========================
   HELPERS / RENDER
========================= */
function exclTone(status) {
  const v = String(status || '').trim();
  switch (v) {
    case 'Open': return { label: 'Open', color: '#1f6f43' };
    case 'Selective': return { label: 'Selective', color: '#8a5a00' };
    case 'Restricted': return { label: 'Restricted', color: '#9b3d2f' };
    case 'Not Available': return { label: 'Not Available', color: '#6B6B67' };
    default: return { label: v || 'Case by Case', color: 'var(--dark)' };
  }
}

function renderMarketsChips(markets, cls) {
  return (markets || []).map(m => `<span class="${cls}">${m}</span>`).join('');
}

function buildP1Filters() {
  const el = document.getElementById('p1filters');
  if (!el) return;
  el.innerHTML = FILTERS.map(f =>
    `<button class="pf-chip${f.id === 'all' ? ' on' : ''}" data-filter="${f.id}">${f.label}</button>`
  ).join('');
}

function setP1Filter(id, btn) {
  activeFilter = slugifyFilter(id);
  document.querySelectorAll('.pf-chip').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  renderBrandGrid();
}

function renderHeroText() {
  const eyebrow = document.getElementById('heroEyebrow');
  const title = document.getElementById('heroTitle');
  if (eyebrow) eyebrow.textContent = COMPANY.hero_eyebrow || 'Curated Brand Portfolio';
  if (title) title.innerHTML = COMPANY.hero_title || 'Built for <em>distribution</em>, private label, and market entry.';
}

function renderBrandGrid() {
  const visible = BORDER.filter(bid => {
    const m = BM[bid];
    if (!m) return false;
    if (activeFilter === 'all') return true;
    return (m.filterTags || []).includes(activeFilter);
  });

  const root = document.getElementById('brandGrid');
  if (!root) return;

  root.innerHTML = visible.map((bid) => {
    const m = BM[bid];
    const hasImage = !!m.listImage;
    const cls = `brand-card${hasImage ? ' has-image' : ''}`;
    const style = hasImage ? ` style="--card-bg:url('${m.listImage}')"` : '';
    return `
      <div class="${cls}"${style} data-brand="${bid}">
        <div class="brand-card-body">
          <div class="bc-name">${m.name}</div>
          <div class="bc-tag">${m.tag}</div>
          <div class="bc-hashtags">${(m.hashtags || []).map(h => `<span class="bc-hash">${h}</span>`).join('')}</div>
        </div>
        <div class="bc-arrow">&#8599;</div>
        <div class="brand-card-edge"></div>
      </div>
    `;
  }).join('');
}

function getProds() {
  const list = PRODUCTS_CACHE[currentBrand] || [];
  if (currentSkuFilter === 'All') return list;
  return list.filter(p => p.type === currentSkuFilter);
}

function renderBrandInfoContent(m) {
  const tone = exclTone(m.exclusivity.status);
  return `
    <div class="info-brand">${m.name}</div>
    <div class="info-tag">${m.tag}</div>
    <div class="info-card"><div class="info-label">About</div><div class="info-note">${m.about}</div></div>
    <div class="info-card"><div class="info-label">Channel</div><div class="info-value">${m.channel}</div></div>
    <div class="info-card"><div class="info-label">Total SKUs</div><div class="info-value">${m.totalSku}</div></div>
    <div class="info-card"><div class="info-label">Supply Mode</div><div class="info-supply">${(m.supply || []).map(s => `<span class="info-badge" style="border-color:${m.accent};color:${m.accent}">${s}</span>`).join('')}</div></div>
    <div class="info-card"><div class="info-label">Active Markets</div><div class="info-market-list">${renderMarketsChips(m.markets, 'info-chip')}</div></div>
    <div class="info-card"><div class="info-label">Exclusivity</div><div class="info-excl"><span class="info-badge" style="border-color:${tone.color};color:${tone.color}">${tone.label}</span><div class="info-note">${m.exclusivity.note || ''}</div></div></div>
  `;
}

function renderSkus(prods, m) {
  if (!prods.length) {
    return `<div style="grid-column:1/-1;padding:60px;text-align:center;font-size:13px;color:var(--mid)">No products in this category.</div>`;
  }

  return prods.map(p => `
    <div class="sku-card" data-sku="${p.id}">
      <div class="sku-img">
        ${p.img ? `<img src="${p.img}" alt="${p.name}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:contain;display:block;padding:18px;">` : ''}
        <span class="sku-img-id">${p.id}</span>
      </div>
      <div class="sku-body">
        <div class="sku-type" style="color:${m.accent}">${p.type}</div>
        <div class="sku-name">${p.name}</div>
        <div class="sku-vol">${p.vol}</div>
        <div class="sku-tags">${(p.tags || []).map(t => `<span class="sku-tag">${t}</span>`).join('')}</div>
      </div>
      <div class="sku-arrow">&#8599;</div>
    </div>
  `).join('');
}

function renderP2() {
  const m = BM[currentBrand];
  if (!m) return;
  const prods = getProds();
  const heroStyle = m.bgImage
    ? `border-top:3px solid ${m.accent};background-image:linear-gradient(to right,rgba(255,255,255,.96),rgba(255,255,255,.90)),url('${m.bgImage}');background-size:cover;background-position:center;`
    : `border-top:3px solid ${m.accent};background:#fff;`;

  const root = document.getElementById('p2c');
  if (!root) return;

  root.innerHTML = `
    <div class="p2-hero" id="brandHero" style="${heroStyle}">
      <div class="p2-top">
        <div class="p2-main-left">
          <div class="p2-copy">
            <div class="p2-eyebrow" style="color:${m.accent}">HAVING Portfolio</div>
            <div class="p2-name">${m.name}</div>
            <div class="p2-tag">${m.tag}</div>
            <div class="p2-about">${m.about}</div>
            <div class="bc-hashtags" style="margin-top:16px">${(m.hashtags || []).map(h => `<span class="bc-hash">${h}</span>`).join('')}</div>
          </div>
        </div>
        <div class="p2-meta-col">
          <div class="p2-mc"><div class="p2-mc-lbl">Channel</div><div class="p2-mc-val">${m.channel}</div></div>
          <div class="p2-mc"><div class="p2-mc-lbl">Total SKUs</div><div class="p2-mc-val" style="font-family:var(--serif);font-size:20px;font-weight:300;color:${m.accent}">${m.totalSku}</div></div>
          <div class="p2-mc"><div class="p2-mc-lbl">Supply Mode</div><div class="p2-supply">${(m.supply || []).map(s => `<span class="p2-sbadge" style="border-color:${m.accent};color:${m.accent}">${s}</span>`).join('')}</div></div>
          <div class="p2-mc"><div class="p2-mc-lbl">Active Markets</div><div class="p2-market-list">${renderMarketsChips(m.markets, 'p2-market-chip')}</div></div>
          <div class="p2-mc"><div class="p2-mc-lbl">Exclusivity</div><div class="p2-excl"><span class="p2-excl-badge" style="border-color:${exclTone(m.exclusivity.status).color};color:${exclTone(m.exclusivity.status).color}">${exclTone(m.exclusivity.status).label}</span><span class="p2-excl-note">${m.exclusivity.note || ''}</span></div></div>
        </div>
      </div>
    </div>

    <div class="sku-wrap">
      <div class="sku-head">
        <div class="sku-title">${m.totalSku} SKUs · showing ${prods.length}</div>
        <div class="sku-filters">${(m.filters || ['All']).map(f => `<button class="sfb${currentSkuFilter === f ? ' on' : ''}" data-sf="${f}">${f}</button>`).join('')}</div>
      </div>
      <div class="sku-grid" id="skuGrid">${renderSkus(prods, m)}</div>
    </div>

    <div class="brand-cta">
      <div class="bcta-txt">Interested in <strong>${m.name}</strong>?</div>
      <button class="bcta-btn" style="background:${m.accent}" data-action="inquire-brand" data-brand="${currentBrand}">Inquire About This Brand &rarr;</button>
    </div>
  `;

  const infoBody = document.getElementById('infoBody');
  if (infoBody) infoBody.innerHTML = renderBrandInfoContent(m);
  handleBrandSticky();
}

function setSF(f, btn) {
  currentSkuFilter = f;
  document.querySelectorAll('.sfb').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  const m = BM[currentBrand];
  const grid = document.getElementById('skuGrid');
  if (grid) grid.innerHTML = renderSkus(getProds(), m);
}

/* =========================
   NAV / PAGE TRANSITION
========================= */
async function goBrand(bid, opts = {}) {
  currentBrand = bid;
  currentSkuFilter = 'All';

  showLoadingOverlay('Loading brand...');

  document.getElementById('p1')?.classList.remove('on');
  document.getElementById('p3')?.classList.remove('on');
  document.getElementById('p2')?.classList.add('on');

  const m = BM[bid];
  if (!m) {
    hideLoadingOverlay();
    return;
  }

  const bc = document.getElementById('bc');
  if (bc) {
    bc.innerHTML = `
      <span class="crumb gnb-catalog" data-action="go-home">Catalog</span>
      <span class="sep bc-desktop-only">/</span>
      <span class="crumb cur bc-desktop-only">${m.name}</span>
    `;
  }

  const prog = document.getElementById('prog');
  if (prog) prog.style.background = m.accent;

  const bsName = document.getElementById('bsName');
  const bsTag = document.getElementById('bsTag');
  const bsSkuChip = document.getElementById('bsSkuChip');
  const bsInquireBtn = document.getElementById('bsInquireBtn');

  if (bsName) bsName.textContent = m.name;
  if (bsTag) bsTag.textContent = m.tag;
  if (bsSkuChip) bsSkuChip.textContent = `${m.totalSku} SKUs`;
  if (bsInquireBtn) {
    bsInquireBtn.style.background = m.accent;
    bsInquireBtn.dataset.brand = currentBrand;
  }

  try {
    await loadBrandProducts(bid);
    setLoadingText('Loading products...');
    setLoadingProgress(84);
    renderP2();
    setLoadingText('Preparing brand page...');
    setLoadingProgress(94);
    window.scrollTo(0, 0);
    handleBrandSticky();
    if (!opts.skipPush) history.pushState({ page: 'brand', bid }, '', `#brand=${bid}`);
    hideLoadingOverlay();
  } catch (err) {
    console.error(err);
    const root = document.getElementById('p2c');
    if (root) {
      root.innerHTML = `<div class="sku-wrap"><div style="padding:48px 0;text-align:center;font-size:13px;color:var(--mid)">Failed to load products. Please try again.</div></div>`;
    }
    hideLoadingOverlay();
  }
}

function goP1(opts = {}) {
  closeModal();
  closeInfoModal();
  document.getElementById('p2')?.classList.remove('on');
  document.getElementById('p3')?.classList.remove('on');
  document.getElementById('p1')?.classList.add('on');
  const bc = document.getElementById('bc');
  if (bc) bc.innerHTML = `<span class="crumb gnb-catalog" data-action="go-home">Catalog</span>`;
  const prog = document.getElementById('prog');
  if (prog) prog.style.background = 'var(--dark)';
  document.getElementById('brandSticky')?.classList.remove('on');
  window.scrollTo(0, 0);
  if (!opts.skipPush) history.pushState({ page: 'home' }, '', '#');
}

/* =========================
   MODAL / INFO
========================= */
function lockBodyScroll() {
  scrollLockCount += 1;
  if (scrollLockCount > 1) return;
  savedScrollY = window.scrollY || window.pageYOffset || 0;
  document.documentElement.classList.add('modal-open');
  document.body.classList.add('modal-open');
  document.body.style.top = `-${savedScrollY}px`;
}

function unlockBodyScroll() {
  if (scrollLockCount === 0) return;
  scrollLockCount -= 1;
  if (scrollLockCount > 0) return;
  const offset = parseInt(document.body.style.top || '0', 10) || 0;
  document.documentElement.classList.remove('modal-open');
  document.body.classList.remove('modal-open');
  document.body.style.top = '';
  window.scrollTo(0, Math.abs(offset));
}

function openInfoModal() {
  if (!currentBrand) return;
  document.getElementById('infoBody').innerHTML = renderBrandInfoContent(BM[currentBrand]);
  document.getElementById('infoModalBg')?.classList.add('on');
  lockBodyScroll();
}

function closeInfoModal() {
  const el = document.getElementById('infoModalBg');
  if (el?.classList.contains('on')) {
    el.classList.remove('on');
    unlockBodyScroll();
  }
}

function bgInfoClose(e) {
  if (e.target === document.getElementById('infoModalBg')) closeInfoModal();
}

function openModal(id) {
  const list = PRODUCTS_CACHE[currentBrand] || [];
  const p = list.find(x => x.id === id);
  if (!p) return;
  const m = BM[p.b];
  const mdot = document.getElementById('mDot');
  const mlbl = document.getElementById('mLbl');
  if (mdot) mdot.style.background = m.accent;
  if (mlbl) mlbl.innerHTML = `${m.name} &middot; ${p.type}`;

  document.getElementById('mBody').innerHTML = `
    <div class="mb-inner">
      <div class="mb-img">
        ${p.img ? `<img src="${p.img}" alt="${p.name}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:contain;display:block;max-height:320px;">` : ''}
        <span class="mb-img-id">${p.id}</span>
      </div>
      <div class="mb-info">
        <div class="mb-type" style="color:${m.accent}">${p.type}</div>
        <div class="mb-title">${p.name}</div>
        <div class="mb-sku">SKU ${p.id} · ${p.vol}</div>
        <div class="mb-rule"></div>
        ${p.desc ? `<div class="mb-lbl">Description</div><div class="mb-desc">${p.desc}</div>` : ''}
        <div class="mb-lbl">Key Ingredients</div>
        <div class="mb-ingr"><div class="mb-chips">${(p.keys || []).map(k => `<span class="mb-chip">${k}</span>`).join('')}</div></div>
        <div class="mb-lbl">Features</div>
        <div class="mb-feats">${(p.feats || []).map(f => `<div class="mb-feat"><div class="mb-feat-dot" style="background:${m.accent}"></div><div class="mb-feat-text">${f}</div></div>`).join('')}</div>
      </div>
    </div>
    <div class="mb-footer">
      <div class="mb-market-row">${renderMarketsChips(m.markets, 'mb-market-chip')}</div>
      <div class="mb-excl-row"><span class="mb-excl-badge" style="border-color:${exclTone(m.exclusivity.status).color};color:${exclTone(m.exclusivity.status).color}">${exclTone(m.exclusivity.status).label}</span><span class="mb-excl-note">${m.exclusivity.note || ''}</span></div>
      <div class="mb-certs">${(p.certs || []).map(c => `<span class="mb-cert" style="border-color:${m.accent};color:${m.accent}">${c}</span>`).join('')}</div>
      <button class="mb-cta" style="background:${m.accent}" data-action="inquire-product" data-product="${p.id}">Inquire About This Product &rarr;</button>
    </div>
  `;

  document.getElementById('modalBg')?.classList.add('on');
  document.getElementById('modalBox').scrollTop = 0;
  lockBodyScroll();
}

function closeModal() {
  const el = document.getElementById('modalBg');
  if (el?.classList.contains('on')) {
    el.classList.remove('on');
    unlockBodyScroll();
  }
}

function bgClose(e) {
  if (e.target === document.getElementById('modalBg')) closeModal();
}

/* =========================
   STICKY / SCROLL
========================= */
function handleBrandSticky() {
  const sticky = document.getElementById('brandSticky');
  if (!sticky) return;
  if (!currentBrand || !document.getElementById('p2')?.classList.contains('on')) {
    sticky.classList.remove('on');
    return;
  }
  const hero = document.getElementById('brandHero');
  if (!hero) {
    sticky.classList.remove('on');
    return;
  }
  const trigger = hero.offsetTop + Math.max(220, hero.offsetHeight - 180);
  sticky.classList.toggle('on', window.scrollY > trigger);
}

window.addEventListener('scroll', () => {
  const el = document.documentElement;
  const pct = el.scrollHeight <= el.clientHeight ? 0 : (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100;
  const prog = document.getElementById('prog');
  if (prog) prog.style.width = `${Math.min(pct, 100)}%`;
  handleBrandSticky();
}, { passive: true });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('modalBg')?.classList.contains('on')) closeModal();
    else if (document.getElementById('infoModalBg')?.classList.contains('on')) closeInfoModal();
  }
});

/* =========================
   INQUIRY
========================= */
function getBrandOptions() {
  return BORDER.map(bid => `<option value="${bid}">${BM[bid].name}</option>`).join('');
}

async function getProductsForBrands(brandIds = []) {
  if (!brandIds.length) return [];
  const groups = await Promise.all(brandIds.map(id => loadBrandProducts(id)));
  return groups.flat();
}

async function updateInquiryProducts(selectedBrands = [], selectedProducts = []) {
  const sel = document.getElementById('inqProducts');
  if (!sel) return;
  const prods = await getProductsForBrands(selectedBrands);
  sel.innerHTML = prods.map(p => `<option value="${p.id}">${BM[p.b].name} — ${p.name}</option>`).join('');
  [...sel.options].forEach(opt => { opt.selected = selectedProducts.includes(opt.value); });
}

function updateInquirySummary() {
  const box = document.getElementById('inquirySummary');
  if (!box) return;
  const brandNames = inquiryState.brands.length ? inquiryState.brands.map(id => BM[id]?.name || id).join('<br>') : 'No brand selected';
  const productNames = inquiryState.products.length
    ? inquiryState.products.map(id => {
        const all = Object.values(PRODUCTS_CACHE).flat();
        const p = all.find(x => x.id === id);
        return p ? `${BM[p.b].name} — ${p.name}` : id;
      }).join('<br>')
    : 'No product selected';
  box.innerHTML = `<strong>Brands</strong><br>${brandNames}<br><br><strong>Products</strong><br>${productNames}`;
}

function seedInquiryMessage() {
  const msg = document.getElementById('inqMessage');
  if (!msg) return;
  const brandNames = inquiryState.brands.length ? inquiryState.brands.map(id => BM[id]?.name || id).join(', ') : '';
  const productNames = inquiryState.products.length
    ? inquiryState.products.map(id => {
        const all = Object.values(PRODUCTS_CACHE).flat();
        const p = all.find(x => x.id === id);
        return p ? p.name : id;
      }).join(', ')
    : '';
  const lines = [];
  if (brandNames) lines.push(`Interested brands: ${brandNames}`);
  if (productNames) lines.push(`Interested products: ${productNames}`);
  lines.push('Please share product details, availability, and next steps.');
  msg.value = lines.join('\n');
}

async function handleInquiryBrandChange() {
  const brandSel = document.getElementById('inqBrand');
  inquiryState.brands = [...brandSel.selectedOptions].map(o => o.value).filter(Boolean);
  const stillValid = inquiryState.products.filter(pid => {
    const all = Object.values(PRODUCTS_CACHE).flat();
    const p = all.find(x => x.id === pid);
    return p && inquiryState.brands.includes(p.b);
  });
  inquiryState.products = stillValid;
  await updateInquiryProducts(inquiryState.brands, inquiryState.products);
  updateInquirySummary();
  seedInquiryMessage();
}

function handleInquiryProductsChange() {
  const prodSel = document.getElementById('inqProducts');
  inquiryState.products = [...prodSel.selectedOptions].map(o => o.value);
  updateInquirySummary();
  seedInquiryMessage();
}

async function renderInquiryPage() {
  const brandSel = document.getElementById('inqBrand');
  if (!brandSel) return;
  brandSel.innerHTML = getBrandOptions();
  [...brandSel.options].forEach(opt => { opt.selected = inquiryState.brands.includes(opt.value); });
  await updateInquiryProducts(inquiryState.brands, inquiryState.products);
  updateInquirySummary();
  seedInquiryMessage();
}

function goInquiryGeneral(opts = {}) {
  closeModal();
  closeInfoModal();
  document.getElementById('p1')?.classList.remove('on');
  document.getElementById('p2')?.classList.remove('on');
  document.getElementById('p3')?.classList.add('on');
  document.getElementById('brandSticky')?.classList.remove('on');
  const bc = document.getElementById('bc');
  if (bc) {
    bc.innerHTML = `
      <span class="crumb gnb-catalog" data-action="go-home">Catalog</span>
      <span class="sep bc-desktop-only">/</span>
      <span class="crumb cur bc-desktop-only">Inquiry</span>
    `;
  }
  const prog = document.getElementById('prog');
  if (prog) prog.style.background = 'var(--dark)';
  renderInquiryPage();
  window.scrollTo(0, 0);
  if (!opts.skipPush) history.pushState({ page: 'inquiry' }, '', '#inquiry');
}

function goInquiryBrand(bid) {
  inquiryState.brands = bid ? [bid] : [];
  inquiryState.products = [];
  goInquiryGeneral();
}

async function goInquiryProduct(pid) {
  const all = Object.values(PRODUCTS_CACHE).flat();
  let p = all.find(x => x.id === pid);
  if (!p && currentBrand) {
    await loadBrandProducts(currentBrand);
    p = (PRODUCTS_CACHE[currentBrand] || []).find(x => x.id === pid);
  }
  if (!p) return;
  inquiryState.brands = [p.b];
  inquiryState.products = [pid];
  closeModal();
  goInquiryGeneral();
}

function setFormStatus(message, type = 'success') {
  const box = document.getElementById('inquiryStatus');
  if (!box) return;
  box.textContent = message;
  box.dataset.type = type;
  box.style.display = 'block';
}

function clearFormStatus() {
  const box = document.getElementById('inquiryStatus');
  if (!box) return;
  box.textContent = '';
  box.style.display = 'none';
  box.dataset.type = '';
}

function submitInquiry(e) {
  e.preventDefault();
  const company = document.getElementById('inqCompany').value.trim();
  const email = document.getElementById('inqEmail').value.trim();
  const phone = document.getElementById('inqPhone').value.trim();
  const region = document.getElementById('inqRegion').value.trim();

  const brandIds = [...document.getElementById('inqBrand').selectedOptions].map(o => o.value);
  const brandNames = brandIds.map(id => BM[id]?.name || id);

  const productIds = [...document.getElementById('inqProducts').selectedOptions].map(o => o.value);
  const productNames = productIds.map(id => {
    const all = Object.values(PRODUCTS_CACHE).flat();
    const p = all.find(x => x.id === id);
    return p ? `${BM[p.b]?.name || p.b} — ${p.name}` : id;
  });

  inquiryState.brands = brandIds;
  inquiryState.products = productIds;

  const message = document.getElementById('inqMessage').value.trim();
  const submitBtn = document.querySelector('.form-submit');
  const originalText = submitBtn ? submitBtn.textContent : 'Send Inquiry';

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';
  }

  clearFormStatus();

  const payload = {
    company, email, phone, region,
    brand_ids: brandIds, brand_names: brandNames,
    product_ids: productIds, product_names: productNames,
    message, source: 'web_catalog'
  };

  fetch(INQUIRY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(async res => {
      let json = {};
      try { json = await res.json(); } catch (_) {}
      if (!res.ok || json.ok === false) throw new Error(json.error || `HTTP ${res.status}`);
      document.getElementById('inquiryForm').reset();
      inquiryState.brands = [];
      inquiryState.products = [];
      renderInquiryPage();
      setFormStatus('Inquiry sent successfully.', 'success');
    })
    .catch(err => {
      console.error(err);
      setFormStatus('Inquiry sending failed. Please try again.', 'error');
    })
    .finally(() => {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
}

/* =========================
   BINDINGS / INIT
========================= */
function initEventBindings() {
  document.addEventListener('click', e => {
    const home = e.target.closest('[data-action="go-home"]');
    if (home) { e.preventDefault(); goP1(); return; }

    const logo = e.target.closest('#gnbLogo');
    if (logo) { e.preventDefault(); goP1(); return; }

    const gnbInq = e.target.closest('#gnbInquireBtn');
    if (gnbInq) { e.preventDefault(); goInquiryGeneral(); return; }

    const infoBtn = e.target.closest('#bsInfoBtn');
    if (infoBtn) { e.preventDefault(); openInfoModal(); return; }

    const infoClose = e.target.closest('#infoCloseBtn');
    if (infoClose) { e.preventDefault(); closeInfoModal(); return; }

    const modalClose = e.target.closest('#modalCloseBtn');
    if (modalClose) { e.preventDefault(); closeModal(); return; }

    const pf = e.target.closest('.pf-chip[data-filter]');
    if (pf) { setP1Filter(pf.dataset.filter, pf); return; }

    const brandCard = e.target.closest('.brand-card[data-brand]');
    if (brandCard) { goBrand(brandCard.dataset.brand); return; }

    const skuFilter = e.target.closest('.sfb[data-sf]');
    if (skuFilter) { setSF(skuFilter.dataset.sf, skuFilter); return; }

    const skuCard = e.target.closest('.sku-card[data-sku]');
    if (skuCard) { openModal(skuCard.dataset.sku); return; }

    const inqBrand = e.target.closest('[data-action="inquire-brand"]');
    if (inqBrand) { goInquiryBrand(inqBrand.dataset.brand || currentBrand); return; }

    const inqProduct = e.target.closest('[data-action="inquire-product"]');
    if (inqProduct) { goInquiryProduct(inqProduct.dataset.product); return; }
  });

  document.getElementById('modalBg')?.addEventListener('click', bgClose);
  document.getElementById('infoModalBg')?.addEventListener('click', bgInfoClose);
  document.getElementById('inqBrand')?.addEventListener('change', handleInquiryBrandChange);
  document.getElementById('inqProducts')?.addEventListener('change', handleInquiryProductsChange);
  document.getElementById('inquiryForm')?.addEventListener('submit', submitInquiry);

  window.addEventListener('popstate', async e => {
    const state = e.state || {};
    if (state.page === 'brand' && state.bid) {
      await goBrand(state.bid, { skipPush: true });
      return;
    }
    if (state.page === 'inquiry') {
      goInquiryGeneral({ skipPush: true });
      return;
    }
    goP1({ skipPush: true });
  });
}

async function bootstrapCatalog() {
  showLoadingOverlay('Connecting to catalog data...');
  try {
    const data = await fetchBrandsAndCompany();
    setLoadingText('Loading brands...');
    setLoadingProgress(82);

    applyCatalogData(data);
    initEventBindings();
    buildP1Filters();
    renderBrandGrid();
    renderHeroText();

    setLoadingText('Preparing catalog...');
    setLoadingProgress(92);

    hideLoadingOverlay();
    history.replaceState({ page: 'home' }, '', '#');
  } catch (err) {
    console.error(err);
    hideLoadingOverlay();
  }
}

document.addEventListener('DOMContentLoaded', bootstrapCatalog);
