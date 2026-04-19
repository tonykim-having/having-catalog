
// FULL VERSION (original structure preserved + loading integration only)

const API_BASE = window.CATALOG_DATA_URL ||
'https://script.google.com/macros/s/AKfycbxg937uz2NriahqW40S_SKxiFksqgyMjDA3js-500sRKVIGFg_9qVsKlRwk-VN34SsTyA/exec';

let BM = {};
let BORDER = [];
let PRODUCTS_CACHE = {};

let currentBrand = null;
let currentSkuFilter = 'All';

let loadingProgress = 0;
let loadingTimer = null;

// ================= LOADING =================
function setLoadingText(text){
  const el = document.getElementById('loadingText');
  if(!el) return;
  el.style.opacity = '0';
  setTimeout(()=>{
    el.textContent = text;
    el.style.opacity = '1';
  },200);
}

function setLoadingProgress(v){
  loadingProgress = Math.min(100, Math.max(0,v));
  const bar = document.getElementById('loadingBarFill');
  if(bar) bar.style.width = loadingProgress + '%';
}

function showLoading(text){
  const layer = document.getElementById('loadingLayer');
  if(!layer) return;
  layer.classList.remove('hidden');
  setLoadingText(text || 'Loading...');
  setLoadingProgress(10);

  if(loadingTimer) clearInterval(loadingTimer);
  loadingTimer = setInterval(()=>{
    if(loadingProgress < 70) setLoadingProgress(loadingProgress + 3);
  },150);
}

function hideLoading(){
  const layer = document.getElementById('loadingLayer');
  if(!layer) return;

  clearInterval(loadingTimer);
  setLoadingProgress(100);
  setLoadingText('Almost ready...');

  setTimeout(()=>{
    layer.classList.add('hidden');
  },200);
}

// ================= FETCH =================
async function fetchJson(url){
  const res = await fetch(url);
  return res.json();
}

async function fetchBrands(){
  const data = await fetchJson(API_BASE + '?type=brands');
  BM = {};
  BORDER = [];

  data.brands.forEach(b=>{
    BM[b.brand_id] = b;
    BORDER.push(b.brand_id);
  });
}

async function fetchProducts(brandId){
  if(PRODUCTS_CACHE[brandId]) return PRODUCTS_CACHE[brandId];

  const data = await fetchJson(API_BASE + '?type=products&brand_id=' + brandId);
  PRODUCTS_CACHE[brandId] = data.products || [];
  return PRODUCTS_CACHE[brandId];
}

// ================= RENDER =================
function renderBrands(){
  const grid = document.getElementById('brandGrid');
  if(!grid) return;

  grid.innerHTML = BORDER.map(id=>{
    const b = BM[id];
    return `
      <div class="brand-card" data-brand="${id}">
        <div class="bc-name">${b.name}</div>
        <div class="bc-tag">${b.short_description || ''}</div>
      </div>
    `;
  }).join('');
}

function renderProducts(products){
  const grid = document.getElementById('skuGrid');
  if(!grid) return;

  grid.innerHTML = products.map(p=>`
    <div class="sku-card">
      <div class="sku-img">
        <img src="${p.image_url}" loading="lazy" decoding="async">
      </div>
      <div class="sku-name">${p.name}</div>
    </div>
  `).join('');
}

// ================= NAV =================
async function goBrand(id){
  currentBrand = id;

  showLoading('Loading brand...');

  document.getElementById('p1')?.classList.remove('on');
  document.getElementById('p2')?.classList.add('on');

  try{
    const products = await fetchProducts(id);

    setLoadingText('Loading products...');
    setLoadingProgress(80);

    renderProducts(products);

    setLoadingText('Preparing page...');
    setLoadingProgress(95);

    window.scrollTo(0,0);

    hideLoading();
  }catch(e){
    console.error(e);
    hideLoading();
  }
}

function goHome(){
  document.getElementById('p2')?.classList.remove('on');
  document.getElementById('p1')?.classList.add('on');
}

// ================= EVENTS =================
function bindEvents(){
  document.addEventListener('click',e=>{
    const brand = e.target.closest('[data-brand]');
    if(brand) goBrand(brand.dataset.brand);

    const home = e.target.closest('[data-action="go-home"]');
    if(home) goHome();
  });
}

// ================= INIT =================
async function init(){
  showLoading('Connecting...');

  await fetchBrands();

  setLoadingText('Loading brands...');
  setLoadingProgress(80);

  renderBrands();

  hideLoading();
}

document.addEventListener('DOMContentLoaded',()=>{
  bindEvents();
  init();
});
