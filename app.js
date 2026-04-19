const API_BASE = 'https://script.google.com/macros/s/YOUR_DEPLOY_ID/exec';

let BRANDS = [];
let PRODUCTS_CACHE = {};

// 초기 로딩
async function init(){
  const res = await fetch(API_BASE + '?type=brands');
  const data = await res.json();

  BRANDS = data.brands || [];
  renderBrands();
}

// 브랜드 클릭 시
async function loadBrandProducts(brandId){
  if(PRODUCTS_CACHE[brandId]){
    return PRODUCTS_CACHE[brandId];
  }

  const res = await fetch(`${API_BASE}?type=products&brand_id=${brandId}`);
  const data = await res.json();

  PRODUCTS_CACHE[brandId] = data.products || [];
  return PRODUCTS_CACHE[brandId];
}

// 브랜드 페이지 진입
async function goBrand(brandId){
  const products = await loadBrandProducts(brandId);

  renderBrandDetail(brandId);
  renderProducts(products);
}

// inquiry에서 사용
async function updateProductsByBrand(brandIds){
  let allProducts = [];

  for(const id of brandIds){
    const products = await loadBrandProducts(id);
    allProducts = allProducts.concat(products);
  }

  renderInquiryProducts(allProducts);
}
