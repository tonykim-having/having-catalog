let BM={}, BORDER=[], FILTERS=[], COMPANY={};
const SKU_CACHE = {}; // brand_id → products[]

const DEFAULT_FILTERS=[
  {id:'all',label:'All Brands'},
  {id:'skincare',label:'Skincare'},
  {id:'haircare',label:'Haircare'},
  {id:'baby-care',label:'Baby Care'},
];

const BASE_URL = 'https://script.google.com/macros/s/AKfycbygPPt2R9UA1xV4mzw4sYnHsb1ASntyXnPto9ENvfxcV0hP-Zp4liHZ6N2utCklOLB8DA/exec';
const INQUIRY_URL = window.CATALOG_INQUIRY_URL || BASE_URL;

/* ── Loading ── */
let loadingProgress=0, loadingTimer=null;

function setLoadingText(text){
  const el=document.getElementById('loadingText');
  if(!el) return;
  el.style.opacity='0';
  setTimeout(()=>{ el.textContent=text; el.style.opacity='1'; },220);
}
function setLoadingProgress(value){
  loadingProgress=Math.max(0,Math.min(100,value));
  const el=document.getElementById('loadingBarFill');
  if(el) el.style.width=loadingProgress+'%';
}
function startLoadingSequence(){
  setLoadingText('Connecting to catalog...');
  setLoadingProgress(10);
  if(loadingTimer) clearInterval(loadingTimer);
  loadingTimer=setInterval(()=>{
    if(loadingProgress<60) setLoadingProgress(loadingProgress+4);
    else if(loadingProgress<76) setLoadingProgress(loadingProgress+1);
  },180);
}
function markLoadingStage(stage){
  if(stage==='fetched'){ setLoadingText('Loading brands...'); setLoadingProgress(Math.max(loadingProgress,82)); }
  if(stage==='rendering'){ setLoadingText('Almost ready...'); setLoadingProgress(Math.max(loadingProgress,95)); }
  if(stage==='done'){ setLoadingProgress(100); }
}
function finishLoading(){
  if(loadingTimer) clearInterval(loadingTimer);
  markLoadingStage('done');
  setTimeout(()=>{ document.getElementById('loadingLayer')?.classList.add('hidden'); },300);
}

/* ── Utilities ── */
function splitMulti(value){
  if(Array.isArray(value)) return value.filter(v=>v!==''&&v!=null);
  if(value==null) return [];
  const str=String(value).trim();
  if(!str) return [];
  return str.split(/[|,]/).map(v=>v.trim()).filter(Boolean);
}
function asText(value,fallback=''){
  if(value==null) return fallback;
  return String(value).trim();
}
function asNumber(value,fallback=0){
  if(typeof value==='number'&&Number.isFinite(value)) return value;
  const n=Number(String(value).replace(/[^\d.-]/g,''));
  return Number.isFinite(n)?n:fallback;
}
function pick(obj,keys,fallback=''){
  for(const key of keys){
    if(obj&&obj[key]!==undefined&&obj[key]!==null&&String(obj[key]).trim()!=='') return obj[key];
  }
  return fallback;
}
function slugify(value){
  return String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
function slugifyFilter(v){
  return String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

/* ── Normalize brands payload ── */
function normalizeBrandsPayload(payload){
  const brandRows=Array.isArray(payload?.brands)?payload.brands:[];
  const brandTechRows=Array.isArray(payload?.brand_tech)?payload.brand_tech:[];
  const filterRows=Array.isArray(payload?.filters)?payload.filters:[];
  const companyRows=Array.isArray(payload?.company)?payload.company:[];

  const techMap={};
  brandTechRows.forEach(row=>{
    const brandId=asText(pick(row,['brand_id','brandId']));
    if(!brandId) return;
    if(!techMap[brandId]) techMap[brandId]=[];
    techMap[brandId].push({
      n:asText(pick(row,['name','title','tech_name'])),
      d:asText(pick(row,['description','desc','tech_description']))
    });
  });

  const BMOut={}, BORDEROut=[];
  brandRows.forEach((row,index)=>{
    const id=asText(pick(row,['id','brand_id','slug']))||slugify(pick(row,['name'],`brand-${index+1}`));
    if(!id) return;
    BORDEROut.push(id);
    BMOut[id]={
      name:asText(pick(row,['name'])),
      accent:asText(pick(row,['accent','accent_color']),'#111110'),
      tag:asText(pick(row,['tag','short_description'])),
      about:asText(pick(row,['about','description','full_description'])),
      hashtags:splitMulti(pick(row,['hashtags','key_claims'])),
      filterTags:splitMulti(pick(row,['filter_tags','filterTags','category_primary'])).map(slugifyFilter),
      supply:splitMulti(pick(row,['supply','supply_mode','pb_available'])).map(v=>String(v).toLowerCase()==='true'?'Private Label':v).filter(Boolean),
      channel:asText(pick(row,['channel','target_channel'])),
      totalSku:asNumber(pick(row,['total_sku','totalSku']),0),
      tech:techMap[id]||[],
      filters:(()=>{
        const vals=splitMulti(pick(row,['filters','category_primary']));
        return ['All',...vals.filter(v=>v&&v!=='All')].filter((v,i,a)=>a.indexOf(v)===i);
      })(),
      markets:splitMulti(pick(row,['markets','active_markets'])).flatMap(v=>String(v).split(',')).map(v=>v.trim()).filter(Boolean),
      exclusivity:{
        status:asText(pick(row,['exclusivity_status','exclusivity','status']),'Case by Case'),
        note:asText(pick(row,['exclusivity_note','note']))
      },
      listImage:asText(pick(row,['list_image','listImage','list_image_url'])),
      bgImage:asText(pick(row,['bg_image','bgImage','brand_bg_image_url']))
    };
  });

  const FILTERSOut=filterRows.length
    ?filterRows.map(row=>({id:slugifyFilter(asText(pick(row,['id']))),label:asText(pick(row,['label','name']))})).filter(f=>f.id&&f.label)
    :DEFAULT_FILTERS;

  let company=companyRows;
  if(companyRows.length===1) company=companyRows[0];

  return {BM:BMOut,BORDER:BORDEROut,FILTERS:FILTERSOut.length?FILTERSOut:DEFAULT_FILTERS,COMPANY:company};
}

/* ── Normalize products payload ── */
function normalizeProductsPayload(payload){
  const productRows=Array.isArray(payload?.products)?payload.products:[];
  return productRows.map(row=>({
    id:asText(pick(row,['id','sku'])),
    b:asText(pick(row,['brand_id','b'])),
    name:asText(pick(row,['name'])),
    vol:asText(pick(row,['vol','volume'])),
    type:asText(pick(row,['type'])),
    tags:splitMulti(pick(row,['tags','subtitle'])),
    keys:splitMulti(pick(row,['keys','ingredients'])),
    feats:splitMulti(pick(row,['feats','features'])),
    desc:asText(pick(row,['product_description','desc'])),
    certs:splitMulti(pick(row,['certs','certifications'])),
    img:asText(pick(row,['img','image','image_url']))
  })).filter(p=>p.id);
}

/* ── Fetch ── */
async function fetchBrands(){
  const res=await fetch(`${BASE_URL}?type=brands`,{cache:'no-store'});
  if(!res.ok) throw new Error(`Brands fetch failed: ${res.status}`);
  return res.json();
}

async function fetchProducts(brandId){
  if(SKU_CACHE[brandId]) return SKU_CACHE[brandId];
  const res=await fetch(`${BASE_URL}?type=products&brand_id=${encodeURIComponent(brandId)}`,{cache:'no-store'});
  if(!res.ok) throw new Error(`Products fetch failed: ${res.status}`);
  const payload=await res.json();
  const products=normalizeProductsPayload(payload);
  SKU_CACHE[brandId]=products;
  return products;
}

/* ── Bootstrap ── */
async function bootstrapCatalog(){
  startLoadingSequence();
  try{
    const payload=await fetchBrands();
    markLoadingStage('fetched');
    const data=normalizeBrandsPayload(payload);
    BM=window.BM=data.BM||{};
    BORDER=window.BORDER=data.BORDER||[];
    FILTERS=window.FILTERS=data.FILTERS||DEFAULT_FILTERS;
    COMPANY=window.COMPANY=data.COMPANY||{};
    initEventBindings();
    buildP1Filters();
    markLoadingStage('rendering');
    renderBrandGrid();
    renderHeroText();
    observeReveals();
    finishLoading();
    history.replaceState({page:'home'},'','#');
  }catch(err){
    console.error(err);
    setLoadingText('Failed to load. Please refresh.');
  }
}

/* ── Hero text ── */
function renderHeroText(){
  const c=Array.isArray(COMPANY)?COMPANY[0]:COMPANY;
  if(!c) return;
  const eyebrow=c.hero_eyebrow||c.heroEyebrow;
  const title=c.hero_title||c.heroTitle;
  const eyebrowEl=document.getElementById('heroEyebrow');
  const titleEl=document.getElementById('heroTitle');
  if(eyebrow&&eyebrowEl) eyebrowEl.innerHTML=eyebrow;
  if(title&&titleEl) titleEl.innerHTML=title;
}

/* ── State ── */
let activeFilter='all', currentBrand=null, currentSkuFilter='All', savedScrollY=0, scrollLockCount=0;

/* ── UI helpers ── */
function exclTone(status){
  switch(status){
    case 'Open': return {label:'Open',color:'#1f6f43'};
    case 'Selective': return {label:'Selective',color:'#8a5a00'};
    case 'Restricted': return {label:'Restricted',color:'#9b3d2f'};
    case 'Not Available': return {label:'Not Available',color:'#6B6B67'};
    default: return {label:status||'Case by Case',color:'var(--dark)'};
  }
}
function renderMarketsChips(markets,cls){
  return (markets||[]).map(m=>`<span class="${cls}">${m}</span>`).join('');
}
function renderBrandInfoContent(m){
  const tone=exclTone(m.exclusivity.status);
  return`
    <div class="info-brand">${m.name}</div>
    <div class="info-tag">${m.tag}</div>
    <div class="info-card"><div class="info-label">About</div><div class="info-note">${m.about}</div></div>
    <div class="info-card"><div class="info-label">Channel</div><div class="info-value">${m.channel}</div></div>
    <div class="info-card"><div class="info-label">Total SKUs</div><div class="info-value">${m.totalSku}</div></div>
    <div class="info-card"><div class="info-label">Supply Mode</div><div class="info-supply">${m.supply.map(s=>`<span class="info-badge" style="border-color:${m.accent};color:${m.accent}">${s}</span>`).join('')}</div></div>
    <div class="info-card"><div class="info-label">Active Markets</div><div class="info-market-list">${renderMarketsChips(m.markets,'info-chip')}</div></div>
    <div class="info-card"><div class="info-label">Exclusivity</div><div class="info-excl"><span class="info-badge" style="border-color:${tone.color};color:${tone.color}">${tone.label}</span><div class="info-note">${m.exclusivity.note}</div></div></div>`;
}

/* ── Page 1 ── */
function buildP1Filters(){
  document.getElementById('p1filters').innerHTML=FILTERS.map(f=>
    `<button class="pf-chip${f.id==='all'?' on':''}" data-filter="${f.id}">${f.label}</button>`
  ).join('');
}
function setP1Filter(id,btn){
  activeFilter=slugifyFilter(id);
  document.querySelectorAll('.pf-chip').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  renderBrandGrid();
}
function renderBrandGrid(){
  const visible=BORDER.filter(bid=>{
    const m=BM[bid];
    if(activeFilter==='all') return true;
    return m.filterTags.includes(activeFilter);
  });
  document.getElementById('brandGrid').innerHTML=visible.map((bid,i)=>{
    const m=BM[bid];
    const hasImage=!!m.listImage;
    const cls=`brand-card reveal${hasImage?' has-image':''}`;
    const style=hasImage?` style="--card-bg:url('${m.listImage}')"`:' ';
    return`<div class="${cls}"${style} data-delay="${(i%6)+1}" data-brand="${bid}">
      <div class="brand-card-body">
        <div class="bc-num">0${BORDER.indexOf(bid)+1}</div>
        <div class="bc-name">${m.name}</div>
        <div class="bc-tag">${m.tag}</div>
        <div class="bc-hashtags">${m.hashtags.map(h=>`<span class="bc-hash">${h}</span>`).join('')}</div>
      </div>
      <div class="bc-arrow">&#8599;</div>
      <div class="brand-card-edge"></div>
    </div>`;
  }).join('');
  observeReveals();
}

/* ── Page 2 ── */
async function goBrand(bid, opts={}){
  currentBrand=bid; currentSkuFilter='All';
  document.getElementById('p1').classList.remove('on');
  document.getElementById('p2').classList.add('on');
  const m=BM[bid];
  document.getElementById('bc').innerHTML=`<span class="crumb gnb-catalog" data-action="go-home">Catalog</span><span class="sep bc-desktop-only">/</span><span class="crumb cur bc-desktop-only">${m.name}</span>`;
  document.getElementById('prog').style.background=m.accent;
  document.getElementById('bsName').textContent=m.name;
  document.getElementById('bsTag').textContent=m.tag;
  document.getElementById('bsSkuChip').textContent=m.totalSku+' SKUs';
  document.getElementById('bsInquireBtn').style.background=m.accent;
  document.getElementById('bsInquireBtn').dataset.brand=currentBrand;
  window.scrollTo(0,0);
  if(!opts.skipPush) history.pushState({page:'brand',bid},'',`#brand=${bid}`);

  renderP2Shell(m);
  handleBrandSticky();

  try{
    const products=await fetchProducts(bid);
    renderSkuSection(products,m);
  }catch(err){
    console.error(err);
    document.getElementById('skuGrid').innerHTML=`<div style="grid-column:1/-1;padding:60px;text-align:center;font-size:13px;color:var(--mid)">Failed to load products. Please try again.</div>`;
  }
}

function renderP2Shell(m){
  const heroStyle=m.bgImage
    ?`border-top:3px solid ${m.accent};background-image:linear-gradient(to right,rgba(255,255,255,.96),rgba(255,255,255,.90)),url('${m.bgImage}');background-size:cover;background-position:center;`
    :`border-top:3px solid ${m.accent};background:#fff;`;
  document.getElementById('p2c').innerHTML=`
    <div class="p2-hero reveal in" id="brandHero" style="${heroStyle}">
      <div class="p2-top">
        <div class="p2-main-left reveal in">
          <div class="p2-copy">
            <div class="p2-eyebrow" style="color:${m.accent}">HAVING Portfolio</div>
            <div class="p2-name">${m.name}</div>
            <div class="p2-tag">${m.tag}</div>
            <div class="p2-about">${m.about}</div>
            <div class="bc-hashtags" style="margin-top:16px">${m.hashtags.map(h=>`<span class="bc-hash">${h}</span>`).join('')}</div>
          </div>
          <div class="p2-tech-inline">${m.tech.map((t,i)=>`<div class="p2-ti reveal in" data-delay="${i+1}"><div class="p2-ti-name">${t.n}</div><div class="p2-ti-desc">${t.d}</div></div>`).join('')}</div>
        </div>
        <div class="p2-meta-col reveal in">
          <div class="p2-mc"><div class="p2-mc-lbl">Channel</div><div class="p2-mc-val">${m.channel}</div></div>
          <div class="p2-mc"><div class="p2-mc-lbl">Total SKUs</div><div class="p2-mc-val" style="font-family:var(--serif);font-size:20px;font-weight:300;color:${m.accent}">${m.totalSku}</div></div>
          <div class="p2-mc"><div class="p2-mc-lbl">Supply Mode</div><div class="p2-supply">${m.supply.map(s=>`<span class="p2-sbadge" style="border-color:${m.accent};color:${m.accent}">${s}</span>`).join('')}</div></div>
          <div class="p2-mc"><div class="p2-mc-lbl">Active Markets</div><div class="p2-market-list">${renderMarketsChips(m.markets,'p2-market-chip')}</div></div>
          <div class="p2-mc"><div class="p2-mc-lbl">Exclusivity</div><div class="p2-excl"><span class="p2-excl-badge" style="border-color:${exclTone(m.exclusivity.status).color};color:${exclTone(m.exclusivity.status).color}">${exclTone(m.exclusivity.status).label}</span><span class="p2-excl-note">${m.exclusivity.note}</span></div></div>
        </div>
      </div>
    </div>
    <div class="sku-wrap reveal in">
      <div class="sku-head">
        <div class="sku-title" id="skuTitle">Loading products...</div>
        <div class="sku-filters" id="skuFilters"></div>
      </div>
      <div class="sku-grid" id="skuGrid">
        <div style="grid-column:1/-1;padding:80px;text-align:center">
          <div class="sku-loading-dots"><span></span><span></span><span></span></div>
        </div>
      </div>
    </div>
    <div class="brand-cta reveal in">
      <div class="bcta-txt">Interested in <strong>${m.name}</strong>?</div>
      <button class="bcta-btn" style="background:${m.accent}" data-action="inquire-brand" data-brand="${currentBrand}">Inquire About This Brand &rarr;</button>
    </div>`;
  document.getElementById('infoBody').innerHTML=renderBrandInfoContent(m);
  observeReveals();
  handleBrandSticky();
}

function renderSkuSection(products,m){
  const titleEl=document.getElementById('skuTitle');
  const filtersEl=document.getElementById('skuFilters');
  if(titleEl) titleEl.textContent=`${m.totalSku} SKUs · showing ${products.length}${m.totalSku>products.length?' featured':''}`;
  if(filtersEl) filtersEl.innerHTML=m.filters.map(f=>`<button class="sfb${currentSkuFilter===f?' on':''}" data-sf="${f}">${f}</button>`).join('');
  document.getElementById('skuGrid').innerHTML=renderSkus(products,m);
  observeReveals();
}

function getProds(){
  const cached=SKU_CACHE[currentBrand]||[];
  return currentSkuFilter==='All' ? cached : cached.filter(p=>p.type===currentSkuFilter);
}

function renderSkus(prods,m){
  if(!prods.length) return`<div style="grid-column:1/-1;padding:60px;text-align:center;font-size:13px;color:var(--mid)">No products in this category.</div>`;
  return prods.map(p=>`
    <div class="sku-card" data-sku="${p.id}">
      <div class="sku-img">${p.img?`<img src="${p.img}" alt="${p.name}" style="width:100%;height:100%;object-fit:contain;display:block;padding:18px;">`:''}<span class="sku-img-id">${p.id}</span></div>
      <div class="sku-body">
        <div class="sku-type" style="color:${m.accent}">${p.type}</div>
        <div class="sku-name">${p.name}</div>
        <div class="sku-vol">${p.vol}</div>
        <div class="sku-tags">${p.tags.map(t=>`<span class="sku-tag">${t}</span>`).join('')}</div>
      </div>
      <div class="sku-arrow">&#8599;</div>
    </div>`).join('');
}

function setSF(f,btn){
  currentSkuFilter=f;
  document.querySelectorAll('.sfb').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('skuGrid').innerHTML=renderSkus(getProds(),BM[currentBrand]);
  observeReveals();
}

function goP1(opts={}){
  closeModal(); closeInfoModal();
  document.getElementById('p2').classList.remove('on');
  document.getElementById('p3').classList.remove('on');
  document.getElementById('p1').classList.add('on');
  document.getElementById('bc').innerHTML=`<span class="crumb gnb-catalog" data-action="go-home">Catalog</span>`;
  document.getElementById('prog').style.background='var(--dark)';
  document.getElementById('brandSticky').classList.remove('on');
  window.scrollTo(0,0);
  if(!opts.skipPush) history.pushState({page:'home'},'','#');
}

/* ── Modal ── */
function lockBodyScroll(){
  scrollLockCount+=1;
  if(scrollLockCount>1) return;
  savedScrollY=window.scrollY||0;
  document.documentElement.classList.add('modal-open');
  document.body.classList.add('modal-open');
  document.body.style.top=`-${savedScrollY}px`;
}
function unlockBodyScroll(){
  if(scrollLockCount===0) return;
  scrollLockCount-=1;
  if(scrollLockCount>0) return;
  const offset=parseInt(document.body.style.top||'0',10)||0;
  document.documentElement.classList.remove('modal-open');
  document.body.classList.remove('modal-open');
  document.body.style.top='';
  window.scrollTo(0,Math.abs(offset));
}
function openInfoModal(){
  if(!currentBrand) return;
  document.getElementById('infoBody').innerHTML=renderBrandInfoContent(BM[currentBrand]);
  document.getElementById('infoModalBg').classList.add('on');
  lockBodyScroll();
}
function closeInfoModal(){
  if(document.getElementById('infoModalBg').classList.contains('on')){
    document.getElementById('infoModalBg').classList.remove('on');
    unlockBodyScroll();
  }
}

function openModal(id){
  const cached=SKU_CACHE[currentBrand]||[];
  const p=cached.find(x=>x.id===id);
  if(!p) return;
  const m=BM[p.b||currentBrand];
  document.getElementById('mDot').style.background=m.accent;
  document.getElementById('mLbl').innerHTML=m.name+' &middot; '+p.type;
  document.getElementById('mBody').innerHTML=`
    <div class="mb-inner">
      <div class="mb-img">${p.img?`<img src="${p.img}" alt="${p.name}" style="width:100%;height:100%;object-fit:contain;display:block;max-height:320px;">`:''}<span class="mb-img-id">${p.id}</span></div>
      <div class="mb-info">
        <div class="mb-type" style="color:${m.accent}">${p.type}</div>
        <div class="mb-title">${p.name}</div>
        <div class="mb-sku">SKU ${p.id} &middot; ${p.vol}</div>
        <div class="mb-rule"></div>
        ${p.desc?`<div class="mb-lbl">Description</div><div class="mb-desc">${p.desc}</div>`:''}
        <div class="mb-lbl">Key Ingredients</div>
        <div class="mb-ingr"><div class="mb-chips">${p.keys.map(k=>`<span class="mb-chip">${k}</span>`).join('')}</div></div>
        <div class="mb-lbl">Features</div>
        <div class="mb-feats">${p.feats.map(f=>`<div class="mb-feat"><div class="mb-feat-dot" style="background:${m.accent}"></div><div class="mb-feat-text">${f}</div></div>`).join('')}</div>
      </div>
    </div>
    <div class="mb-footer">
      <div class="mb-market-row">${renderMarketsChips(m.markets,'mb-market-chip')}</div>
      <div class="mb-excl-row"><span class="mb-excl-badge" style="border-color:${exclTone(m.exclusivity.status).color};color:${exclTone(m.exclusivity.status).color}">${exclTone(m.exclusivity.status).label}</span><span class="mb-excl-note">${m.exclusivity.note}</span></div>
      <div class="mb-certs">${p.certs.map(c=>`<span class="mb-cert" style="border-color:${m.accent};color:${m.accent}">${c}</span>`).join('')}</div>
      <button class="mb-cta" style="background:${m.accent}" data-action="inquire-product" data-product="${p.id}">Inquire About This Product &rarr;</button>
    </div>`;
  document.getElementById('modalBg').classList.add('on');
  document.getElementById('modalBox').scrollTop=0;
  lockBodyScroll();
}
function closeModal(){
  if(document.getElementById('modalBg').classList.contains('on')){
    document.getElementById('modalBg').classList.remove('on');
    unlockBodyScroll();
  }
}

/* ── Reveal observer ── */
const revealObserver=new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{if(entry.isIntersecting) entry.target.classList.add('in');});
},{threshold:0.12,rootMargin:'0px 0px -8% 0px'});

function observeReveals(){
  document.querySelectorAll('.reveal').forEach(el=>{
    if(el.classList.contains('in')) return;
    revealObserver.observe(el);
  });
}

/* ── Sticky ── */
function handleBrandSticky(){
  const sticky=document.getElementById('brandSticky');
  if(!sticky) return;
  if(!currentBrand||!document.getElementById('p2').classList.contains('on')){
    sticky.classList.remove('on'); return;
  }
  const hero=document.getElementById('brandHero');
  if(!hero){sticky.classList.remove('on');return;}
  const trigger=hero.offsetTop+Math.max(220,hero.offsetHeight-180);
  sticky.classList.toggle('on',window.scrollY>trigger);
}

window.addEventListener('scroll',()=>{
  const el=document.documentElement;
  const pct=el.scrollHeight<=el.clientHeight?0:(el.scrollTop/(el.scrollHeight-el.clientHeight))*100;
  document.getElementById('prog').style.width=Math.min(pct,100)+'%';
  handleBrandSticky();
},{passive:true});

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(document.getElementById('modalBg').classList.contains('on')) closeModal();
    else if(document.getElementById('infoModalBg').classList.contains('on')) closeInfoModal();
  }
});

/* ── Inquiry ── */
const inquiryState={brands:[],products:[]};

function getBrandOptions(){
  return BORDER.map(bid=>`<option value="${bid}">${BM[bid].name}</option>`).join('');
}
function getProductsForBrands(brandIds=[]){
  return brandIds.flatMap(bid=>SKU_CACHE[bid]||[]);
}
function updateInquiryProducts(selectedBrands=[],selectedProducts=[]){
  const sel=document.getElementById('inqProducts');
  if(!sel) return;
  const prods=getProductsForBrands(selectedBrands);
  sel.innerHTML=prods.map(p=>`<option value="${p.id}">${BM[p.b||selectedBrands[0]]?.name||''} — ${p.name}</option>`).join('');
  [...sel.options].forEach(opt=>{opt.selected=selectedProducts.includes(opt.value);});
}
function updateInquirySummary(){
  const box=document.getElementById('inquirySummary');
  if(!box) return;
  const brandNames=inquiryState.brands.length?inquiryState.brands.map(id=>BM[id]?.name||id).join('<br>'):'No brand selected';
  const allProds=getProductsForBrands(inquiryState.brands);
  const productNames=inquiryState.products.length?inquiryState.products.map(id=>{const p=allProds.find(x=>x.id===id);return p?p.name:id}).join('<br>'):'No product selected';
  box.innerHTML=`<strong>Brands</strong><br>${brandNames}<br><br><strong>Products</strong><br>${productNames}`;
}
function seedInquiryMessage(){
  const msg=document.getElementById('inqMessage');
  if(!msg) return;
  const brandNames=inquiryState.brands.length?inquiryState.brands.map(id=>BM[id]?.name||id).join(', '):'';
  const allProds=getProductsForBrands(inquiryState.brands);
  const productNames=inquiryState.products.length?inquiryState.products.map(id=>{const p=allProds.find(x=>x.id===id);return p?p.name:id}).join(', '):'';
  const lines=[];
  if(brandNames) lines.push(`Interested brands: ${brandNames}`);
  if(productNames) lines.push(`Interested products: ${productNames}`);
  lines.push('Please share product details, availability, and next steps.');
  msg.value=lines.join('\n');
}
function handleInquiryBrandChange(){
  const brandSel=document.getElementById('inqBrand');
  inquiryState.brands=[...brandSel.selectedOptions].map(o=>o.value).filter(Boolean);
  const allProds=getProductsForBrands(inquiryState.brands);
  inquiryState.products=inquiryState.products.filter(pid=>allProds.find(p=>p.id===pid));
  updateInquiryProducts(inquiryState.brands,inquiryState.products);
  updateInquirySummary();
  seedInquiryMessage();
}
function handleInquiryProductsChange(){
  const prodSel=document.getElementById('inqProducts');
  inquiryState.products=[...prodSel.selectedOptions].map(o=>o.value);
  updateInquirySummary();
  seedInquiryMessage();
}
function renderInquiryPage(){
  const brandSel=document.getElementById('inqBrand');
  brandSel.innerHTML=getBrandOptions();
  [...brandSel.options].forEach(opt=>{opt.selected=inquiryState.brands.includes(opt.value);});
  updateInquiryProducts(inquiryState.brands,inquiryState.products);
  updateInquirySummary();
  seedInquiryMessage();
}

function goInquiryGeneral(opts={}){
  closeModal(); closeInfoModal();
  document.getElementById('p1').classList.remove('on');
  document.getElementById('p2').classList.remove('on');
  document.getElementById('p3').classList.add('on');
  document.getElementById('brandSticky').classList.remove('on');
  document.getElementById('bc').innerHTML=`<span class="crumb gnb-catalog" data-action="go-home">Catalog</span><span class="sep bc-desktop-only">/</span><span class="crumb cur bc-desktop-only">Inquiry</span>`;
  document.getElementById('prog').style.background='var(--dark)';
  renderInquiryPage();
  window.scrollTo(0,0);
  if(!opts.skipPush) history.pushState({page:'inquiry'},'','#inquiry');
}
function goInquiryBrand(bid){
  inquiryState.brands=bid?[bid]:[];
  inquiryState.products=[];
  goInquiryGeneral();
}
function goInquiryProduct(pid){
  const cached=SKU_CACHE[currentBrand]||[];
  const p=cached.find(x=>x.id===pid);
  if(!p) return;
  inquiryState.brands=[currentBrand];
  inquiryState.products=[pid];
  closeModal();
  goInquiryGeneral();
}

function submitInquiry(e){
  e.preventDefault();
  const company=document.getElementById('inqCompany').value.trim();
  const email=document.getElementById('inqEmail').value.trim();
  const phone=document.getElementById('inqPhone').value.trim();
  const region=document.getElementById('inqRegion').value.trim();
  const brandIds=[...document.getElementById('inqBrand').selectedOptions].map(o=>o.value);
  const brandNames=brandIds.map(id=>BM[id]?.name||id);
  const productIds=[...document.getElementById('inqProducts').selectedOptions].map(o=>o.value);
  const allProds=getProductsForBrands(brandIds);
  const productNames=productIds.map(id=>{const p=allProds.find(x=>x.id===id);return p?`${BM[p.b||brandIds[0]]?.name||''} — ${p.name}`:id;});
  inquiryState.brands=brandIds;
  inquiryState.products=productIds;
  const message=document.getElementById('inqMessage').value.trim();
  const submitBtn=document.querySelector('.form-submit');
  const originalText=submitBtn?submitBtn.textContent:'Send Inquiry';
  if(submitBtn){submitBtn.disabled=true;submitBtn.textContent='Sending...';}
  fetch(INQUIRY_URL,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({company,email,phone,region,brand_ids:brandIds,brand_names:brandNames,product_ids:productIds,product_names:productNames,message})
  })
  .then(async res=>{
    let json={};
    try{json=await res.json();}catch(_){}
    if(!res.ok||json.ok===false) throw new Error(json.error||`HTTP ${res.status}`);
    alert('Inquiry sent successfully.');
    document.getElementById('inquiryForm').reset();
    inquiryState.brands=[];inquiryState.products=[];
    renderInquiryPage();
  })
  .catch(err=>{console.error(err);alert('Inquiry sending failed. Please try again.');})
  .finally(()=>{if(submitBtn){submitBtn.disabled=false;submitBtn.textContent=originalText;}});
}

/* ── Event bindings ── */
function initEventBindings(){
  document.addEventListener('click',(e)=>{
    const home=e.target.closest('[data-action="go-home"]');
    if(home){e.preventDefault();goP1();return;}
    const logo=e.target.closest('#gnbLogo');
    if(logo){e.preventDefault();goP1();return;}
    const gnbInq=e.target.closest('#gnbInquireBtn');
    if(gnbInq){e.preventDefault();goInquiryGeneral();return;}
    const infoBtn=e.target.closest('#bsInfoBtn');
    if(infoBtn){e.preventDefault();openInfoModal();return;}
    const infoClose=e.target.closest('#infoCloseBtn');
    if(infoClose){e.preventDefault();closeInfoModal();return;}
    const modalClose=e.target.closest('#modalCloseBtn');
    if(modalClose){e.preventDefault();closeModal();return;}
    const pf=e.target.closest('.pf-chip[data-filter]');
    if(pf){setP1Filter(pf.dataset.filter,pf);return;}
    const brandCard=e.target.closest('.brand-card[data-brand]');
    if(brandCard){goBrand(brandCard.dataset.brand);return;}
    const skuFilter=e.target.closest('.sfb[data-sf]');
    if(skuFilter){setSF(skuFilter.dataset.sf,skuFilter);return;}
    const skuCard=e.target.closest('.sku-card[data-sku]');
    if(skuCard){openModal(skuCard.dataset.sku);return;}
    const inqBrand=e.target.closest('[data-action="inquire-brand"]');
    if(inqBrand){goInquiryBrand(inqBrand.dataset.brand||currentBrand);return;}
    const inqProduct=e.target.closest('[data-action="inquire-product"]');
    if(inqProduct){goInquiryProduct(inqProduct.dataset.product);return;}
  });
  const infoBg=document.getElementById('infoModalBg');
  if(infoBg) infoBg.addEventListener('click',(e)=>{if(e.target===infoBg)closeInfoModal();});
  const modalBg=document.getElementById('modalBg');
  if(modalBg) modalBg.addEventListener('click',(e)=>{if(e.target===modalBg)closeModal();});
  const inquiryForm=document.getElementById('inquiryForm');
  if(inquiryForm) inquiryForm.addEventListener('submit',submitInquiry);
  const inqBrandEl=document.getElementById('inqBrand');
  if(inqBrandEl) inqBrandEl.addEventListener('change',handleInquiryBrandChange);
  const inqProductsEl=document.getElementById('inqProducts');
  if(inqProductsEl) inqProductsEl.addEventListener('change',handleInquiryProductsChange);
}

/* ── Popstate ── */
window.addEventListener('popstate',()=>{
  const h=location.hash;
  if(!h||h==='#'){goP1({skipPush:true});}
  else if(h.startsWith('#brand=')){
    const bid=h.replace('#brand=','');
    if(BM[bid]) goBrand(bid,{skipPush:true});
    else goP1({skipPush:true});
  }else if(h==='#inquiry'){goInquiryGeneral({skipPush:true});}
  else{goP1({skipPush:true});}
});

/* ── SKU loading dots style ── */
const _dotsStyle=document.createElement('style');
_dotsStyle.textContent=`
.sku-loading-dots{display:flex;gap:8px;justify-content:center;align-items:center}
.sku-loading-dots span{width:6px;height:6px;border-radius:50%;background:var(--mid);opacity:0.3;animation:skuDot 1.2s ease-in-out infinite}
.sku-loading-dots span:nth-child(2){animation-delay:.2s}
.sku-loading-dots span:nth-child(3){animation-delay:.4s}
@keyframes skuDot{0%,80%,100%{opacity:0.3;transform:scale(1)}40%{opacity:1;transform:scale(1.3)}}
.mb-desc{font-size:14px;color:var(--mid);line-height:1.72;margin-bottom:16px}
.bc-desktop-only{display:inline}
@media(max-width:768px){.bc-desktop-only{display:none!important}}
`;
document.head.appendChild(_dotsStyle);

bootstrapCatalog();
