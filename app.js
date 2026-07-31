/* global supabase */
const cfg = window.STOCK3D_CONFIG || {};
const configured = cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes('VOTRE-PROJET');
const el = (id) => document.getElementById(id);
const state = { products: [], categories: [], technicians: [], movements: [], channel: null };
let db;
const euro = (n) => new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(n||0));
const PACKAGE_TYPES = ['unité','carton','boîte','lot','bidon','flacon','bombe','tube','sachet','seau','rouleau','kilogramme','litre','mètre','autre'];
const CONTENT_UNITS = ['unité','pièce','bombe','tube','sachet','flacon','litre','kilogramme','mètre','rouleau','dose','autre'];
const safe = (v) => v == null ? '' : v;
function packageLabel(p){const type=p.stock_package_type||'unité';const mult=Number(p.stock_package_quantity||1);const unit=p.stock_content_unit||'unité';return mult>1?`${type} de ${mult} ${unit}${mult>1&&!unit.endsWith('s')?'s':''}`:type;}
function priceLabel(p){const amount=Number(p.price_amount ?? p.unit_price ?? 0);const type=p.price_type||'unit';if(type==='package'){const pkg=p.price_package_type||p.stock_package_type||'lot';const qty=Number(p.price_package_quantity||p.stock_package_quantity||1);return `${euro(amount)} / ${pkg}${qty>1?` (${qty} ${p.stock_content_unit||'unités'})`:''}`;}return `${euro(amount)} / ${p.stock_content_unit||'unité'}`;}
function baseUnitPrice(p){const amount=Number(p.price_amount ?? p.unit_price ?? 0);return (p.price_type||'unit')==='package'?amount/Math.max(Number(p.price_package_quantity||1),1):amount;}
function stockValue(p){return Number(p.stock||0)*Math.max(Number(p.stock_package_quantity||1),1)*baseUnitPrice(p);}
function stockDisplay(p){return `${p.stock} ${packageLabel(p)}`;}
const dt = (v) => new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v));
const esc = (s='') => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function status(p){const s=Number(p.stock); if(s<=0)return ['out','Épuisé']; if(s<=Number(p.alert_threshold))return ['low','Stock faible']; return ['ok','Disponible'];}
function toast(message){el('toast').textContent=message;el('toast').classList.add('show');setTimeout(()=>el('toast').classList.remove('show'),2300)}
function show(id){['loading','setupScreen','app'].forEach(x=>el(x).classList.add('hidden'));el(id).classList.remove('hidden')}

async function init(){
  if(!configured){show('setupScreen');return;}
  db = supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  show('app');
  await loadAll();
  subscribeRealtime();
}
async function loadAll(){
  setSync(false);
  const [p,c,t,m]=await Promise.all([
    db.from('products').select('*,categories(name)').order('name'),
    db.from('categories').select('*').order('name'),
    db.from('technicians').select('*').eq('active',true).order('name'),
    db.from('stock_movements').select('*,products(name,internal_reference),technicians(name)').order('created_at',{ascending:false}).limit(500)
  ]);
  const err=p.error||c.error||t.error||m.error;if(err){toast(err.message);setSync(true);return;}
  state.products=p.data;state.categories=c.data;state.technicians=t.data;state.movements=m.data;renderAll();setSync(true);
}
function subscribeRealtime(){
  if(state.channel)db.removeChannel(state.channel);
  state.channel=db.channel('stock3d-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'products'},()=>reloadProducts())
    .on('postgres_changes',{event:'*',schema:'public',table:'stock_movements'},()=>reloadMovements())
    .on('postgres_changes',{event:'*',schema:'public',table:'categories'},()=>reloadCategories())
    .on('postgres_changes',{event:'*',schema:'public',table:'technicians'},()=>reloadTechnicians())
    .subscribe((s)=>setSync(s==='SUBSCRIBED'));
}
function setSync(ok){el('syncState').textContent=ok?'● Synchronisé':'◌ Synchronisation…'}
async function reloadProducts(){const {data}=await db.from('products').select('*,categories(name)').order('name');if(data){state.products=data;renderAll();}}
async function reloadMovements(){const {data}=await db.from('stock_movements').select('*,products(name,internal_reference),technicians(name)').order('created_at',{ascending:false}).limit(500);if(data){state.movements=data;renderMovements();renderDashboard();}}
async function reloadCategories(){const {data}=await db.from('categories').select('*').order('name');if(data){state.categories=data;renderAll();}}
async function reloadTechnicians(){const {data}=await db.from('technicians').select('*').eq('active',true).order('name');if(data){state.technicians=data;renderSettings();}}

function renderAll(){renderDashboard();renderInventory();renderMovements();renderSettings();populateFilters()}
function renderDashboard(){
  const low=state.products.filter(p=>status(p)[0]==='low'),out=state.products.filter(p=>status(p)[0]==='out');
  el('statProducts').textContent=state.products.length;el('statValue').textContent=euro(state.products.reduce((a,p)=>a+stockValue(p),0));el('statLow').textContent=low.length;el('statOut').textContent=out.length;
  el('dashboardAlerts').innerHTML=[...out,...low].slice(0,8).map(p=>`<div class="alert-row"><span class="badge ${status(p)[0]}">${status(p)[1]}</span><div class="row-main"><strong>${esc(p.name)}</strong><small>Stock : ${stockDisplay(p)} · seuil : ${p.alert_threshold}</small></div></div>`).join('')||'<div class="empty">Aucune alerte</div>';
  el('recentMovements').innerHTML=state.movements.slice(0,8).map(m=>movementCard(m)).join('')||'<div class="empty">Aucun mouvement</div>';
}
function filtered(){const q=el('searchInput').value.toLowerCase(),cat=el('categoryFilter').value,st=el('statusFilter').value;return state.products.filter(p=>(!q||[p.supplier_reference,p.internal_reference,p.name,p.description,p.supplier,p.target_pest].join(' ').toLowerCase().includes(q))&&(!cat||p.category_id===cat)&&(!st||status(p)[0]===st));}
function renderInventory(){const list=filtered();el('inventoryCount').textContent=`${list.length} produit${list.length>1?'s':''}`;el('inventoryValue').textContent=euro(list.reduce((a,p)=>a+stockValue(p),0));el('inventoryBody').innerHTML=list.map(p=>{const [k,l]=status(p);return `<tr><td><div class="actions"><button class="stock-btn plus" onclick="openMovement('${p.id}','entry')">+</button><button class="stock-btn minus" onclick="openMovement('${p.id}','exit')">−</button></div></td><td><div class="product-name"><strong>${esc(p.name)}</strong><small>${esc(p.description)||'—'}</small></div></td><td>${esc(p.categories?.name)||'—'}</td><td>${esc(p.supplier_reference)||'—'}</td><td>${esc(p.supplier)||'—'}</td><td>${esc(p.target_pest)||'—'}</td><td><strong>${stockDisplay(p)}</strong><small class="cell-note">${Number(p.stock_package_quantity||1)>1?`${Number(p.stock||0)*Number(p.stock_package_quantity||1)} ${esc(p.stock_content_unit||'unités')} au total`:''}</small></td><td>${priceLabel(p)}<small class="cell-note">${(p.price_type||'unit')==='package'?`${euro(baseUnitPrice(p))} / ${esc(p.stock_content_unit||'unité')}`:''}</small></td><td><strong>${euro(stockValue(p))}</strong></td><td><span class="badge ${k}">${l}</span></td><td><div class="actions"><button class="edit-btn" onclick="openProduct('${p.id}')">Modifier</button></div></td></tr>`}).join('')||'<tr><td colspan="11" class="empty">Aucun produit</td></tr>';requestAnimationFrame(()=>{syncInventoryTopScrollbar();enableColumnResize();})}
function movementCard(m){return `<div class="movement-row"><span class="badge ${m.movement_type}">${m.movement_type==='entry'?'Entrée':'Sortie'}</span><div class="row-main"><strong>${esc(m.products?.name||'Produit')}</strong><small>${m.quantity} · ${esc(m.technicians?.name||'—')} · ${dt(m.created_at)}</small></div></div>`}
function renderMovements(){el('movementsBody').innerHTML=state.movements.map(m=>`<tr><td>${dt(m.created_at)}</td><td>${esc(m.products?.internal_reference)||'—'}</td><td>${esc(m.products?.name)||'—'}</td><td><span class="badge ${m.movement_type}">${m.movement_type==='entry'?'Entrée':'Sortie'}</span></td><td>${m.quantity}</td><td>${esc(m.technicians?.name)||'—'}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">Aucun mouvement</td></tr>'}
function renderSettings(){el('categoryList').innerHTML=state.categories.map(x=>`<div class="manage-item"><span>${esc(x.name)}</span><button onclick="deleteCategory('${x.id}')">Supprimer</button></div>`).join('');el('technicianList').innerHTML=state.technicians.map(x=>`<div class="manage-item"><span>${esc(x.name)}</span><button onclick="deleteTechnician('${x.id}')">Supprimer</button></div>`).join('')}
function populateFilters(){const v=el('categoryFilter').value;el('categoryFilter').innerHTML='<option value="">Toutes les catégories</option>'+state.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');el('categoryFilter').value=v}

function modal(title,eyebrow,html){el('modalTitle').textContent=title;el('modalEyebrow').textContent=eyebrow;el('modalContent').innerHTML=html;el('modalBackdrop').classList.remove('hidden')}
function closeModal(){el('modalBackdrop').classList.add('hidden')}

function syncInventoryTopScrollbar(){
  const top=el('inventoryTopScrollbar'), inner=el('inventoryTopScrollbarInner'), wrap=el('inventoryTableWrap');
  if(!top||!inner||!wrap)return;
  const table=wrap.querySelector('table');
  inner.style.width=`${table?table.scrollWidth:wrap.scrollWidth}px`;
  top.classList.toggle('hidden',wrap.scrollWidth<=wrap.clientWidth+1);
  if(!top.dataset.synced){
    let lock=false;
    top.addEventListener('scroll',()=>{if(lock)return;lock=true;wrap.scrollLeft=top.scrollLeft;lock=false});
    wrap.addEventListener('scroll',()=>{if(lock)return;lock=true;top.scrollLeft=wrap.scrollLeft;lock=false});
    top.dataset.synced='1';
  }
  top.scrollLeft=wrap.scrollLeft;
}
window.addEventListener('resize',syncInventoryTopScrollbar);

window.openProduct=function(id=''){
  const p=state.products.find(x=>x.id===id)||{};
  const stockType=p.stock_package_type||'unité';
  const contentUnit=p.stock_content_unit||'unité';
  const priceType=p.price_type||'unit';
  const priceAmount=p.price_amount??p.unit_price??0;
  const pricePackageType=p.price_package_type||stockType;
  const pricePackageQuantity=p.price_package_quantity||p.stock_package_quantity||1;
  const options=(values,current)=>values.map(v=>`<option value="${v}" ${v===current?'selected':''}>${v.charAt(0).toUpperCase()+v.slice(1)}</option>`).join('');
  modal(id?'Modifier le produit':'Ajouter un produit','FICHE PRODUIT',`<form id="productForm">
    <div class="form-grid">
      <label>Référence fournisseur<input name="supplier_reference" value="${esc(safe(p.supplier_reference))}"></label>
      <label>Référence interne<input name="internal_reference" required value="${esc(safe(p.internal_reference))}"></label>
      <label>Nom du produit<input name="name" required value="${esc(safe(p.name))}"></label>
      <label>Description<input name="description" value="${esc(safe(p.description))}"></label>
      <label>Catégorie<select name="category_id"><option value="">—</option>${state.categories.map(c=>`<option value="${c.id}" ${p.category_id===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label>Fournisseur<input name="supplier" value="${esc(safe(p.supplier))}"></label>
      <label>Nuisible ciblé<input name="target_pest" value="${esc(safe(p.target_pest))}"></label>
    </div>
    <div class="form-section"><h3>Stock et conditionnement</h3><div class="form-grid">
      <label>Quantité en stock<input name="stock" type="number" min="0" step="0.01" required value="${p.stock??0}"></label>
      <label>Type de stock<select name="stock_package_type" id="stockPackageType">${options(PACKAGE_TYPES,stockType)}</select></label>
      <label id="stockPackageQuantityLabel">Quantité contenue<input name="stock_package_quantity" id="stockPackageQuantity" type="number" min="0.01" step="0.01" required value="${p.stock_package_quantity??1}"></label>
      <label>Unité contenue<select name="stock_content_unit">${options(CONTENT_UNITS,contentUnit)}</select></label>
      <label>Seuil d’alerte<input name="alert_threshold" type="number" min="0" step="0.01" required value="${p.alert_threshold??0}"></label>
    </div></div>
    <div class="form-section"><h3>Prix</h3><div class="form-grid">
      <label>Le prix indiqué correspond à<select name="price_type" id="priceType"><option value="unit" ${priceType==='unit'?'selected':''}>Prix à l’unité</option><option value="package" ${priceType==='package'?'selected':''}>Prix du conditionnement</option></select></label>
      <label>Prix indiqué (€)<input name="price_amount" type="number" min="0" step="0.01" required value="${priceAmount}"></label>
      <label class="price-package-field">Type de conditionnement du prix<select name="price_package_type">${options(PACKAGE_TYPES,pricePackageType)}</select></label>
      <label class="price-package-field">Quantité comprise dans ce prix<input name="price_package_quantity" type="number" min="0.01" step="0.01" value="${pricePackageQuantity}"></label>
    </div><p class="form-help" id="priceHelp"></p></div>
    <div class="form-actions">${id?'<button type="button" id="deleteProductBtn" class="btn danger">Supprimer</button>':''}<button type="button" class="btn secondary" id="cancelModal">Annuler</button><button class="btn primary">Enregistrer</button></div>
  </form>`);
  const form=el('productForm');
  const updateDynamicFields=()=>{
    const isPackage=form.price_type.value==='package';
    form.querySelectorAll('.price-package-field').forEach(x=>x.classList.toggle('hidden',!isPackage));
    const qty=Math.max(Number(form.price_package_quantity.value||1),1);
    const amount=Number(form.price_amount.value||0);
    el('priceHelp').textContent=isPackage?`Prix calculé par ${form.stock_content_unit.value} : ${euro(amount/qty)}`:`Prix appliqué à chaque ${form.stock_content_unit.value}.`;
    const simple=['unité','kilogramme','litre','mètre'].includes(form.stock_package_type.value);
    el('stockPackageQuantityLabel').classList.toggle('hidden',simple);
    if(simple)form.stock_package_quantity.value=1;
  };
  ['price_type','price_amount','price_package_quantity','stock_content_unit','stock_package_type'].forEach(n=>form[n].addEventListener('input',updateDynamicFields));
  updateDynamicFields();
  el('cancelModal').onclick=closeModal;
  form.onsubmit=async(e)=>{
    e.preventDefault();
    const data=Object.fromEntries(new FormData(e.target));
    ['stock','alert_threshold','stock_package_quantity','price_amount','price_package_quantity'].forEach(k=>data[k]=Number(data[k]));
    data.category_id=data.category_id||null;
    if(data.price_type==='unit'){
      data.price_package_type=null;
      data.price_package_quantity=1;
      data.unit_price=data.price_amount;
    }else{
      data.unit_price=data.price_amount/Math.max(data.price_package_quantity,1);
    }
    const q=id?db.from('products').update(data).eq('id',id):db.from('products').insert(data);
    const {error}=await q;
    if(error)toast(error.message);else{closeModal();toast('Produit enregistré')}
  };
  if(id)el('deleteProductBtn').onclick=()=>deleteProduct(id);
}
window.openMovement=function(id,type){const p=state.products.find(x=>x.id===id);const isExit=type==='exit';modal(`${isExit?'Sortie':'Entrée'} — ${p.name}`,isExit?'STOCK SORTANT':'STOCK ENTRANT',`<form id="movementForm" class="movement-form"><label>Quantité (${packageLabel(p)})<input name="quantity" type="number" min="0.01" step="0.01" required autofocus></label>${isExit?`<label>Technicien<select name="technician_id" required><option value="">Sélectionner…</option>${state.technicians.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label>`:''}<div class="form-actions"><button type="button" class="btn secondary" id="cancelModal">Annuler</button><button class="btn ${isExit?'danger':'primary'}">Valider</button></div></form>`);el('cancelModal').onclick=closeModal;el('movementForm').onsubmit=async(e)=>{e.preventDefault();const f=new FormData(e.target);const {error}=await db.rpc('change_stock',{p_product_id:id,p_type:type,p_quantity:Number(f.get('quantity')),p_technician_id:f.get('technician_id')||null});if(error)toast(error.message);else{closeModal();toast('Stock mis à jour')}}}
window.deleteProduct=async function(id){if(!confirm('Supprimer ce produit ?'))return;const {error}=await db.from('products').delete().eq('id',id);if(error)toast(error.message);else{closeModal();toast('Produit supprimé')}}
window.deleteCategory=async function(id){if(!confirm('Supprimer cette catégorie ? Les produits resteront présents.'))return;const {error}=await db.from('categories').delete().eq('id',id);if(error)toast(error.message)}
window.deleteTechnician=async function(id){if(!confirm('Retirer ce technicien de la liste ?'))return;const {error}=await db.from('technicians').update({active:false}).eq('id',id);if(error)toast(error.message)}

el('closeModal').onclick=closeModal;el('modalBackdrop').onclick=e=>{if(e.target===el('modalBackdrop'))closeModal()};el('addProductTop').onclick=()=>openProduct();
['searchInput','categoryFilter','statusFilter'].forEach(id=>el(id).addEventListener(id==='searchInput'?'input':'change',renderInventory));
el('categoryForm').onsubmit=async e=>{e.preventDefault();const name=el('newCategory').value.trim();if(!name)return;const {error}=await db.from('categories').insert({name});if(error)toast(error.message);else{el('newCategory').value='';toast('Catégorie ajoutée')}};
el('technicianForm').onsubmit=async e=>{e.preventDefault();const name=el('newTechnician').value.trim();if(!name)return;const {error}=await db.from('technicians').insert({name});if(error)toast(error.message);else{el('newTechnician').value='';toast('Technicien ajouté')}};
document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>{document.querySelectorAll('.nav-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));el(`${b.dataset.view}View`).classList.add('active');el('pageTitle').textContent=b.querySelector('span').textContent;el('sidebar').classList.remove('open')});
function updateMenuButton(){
  const btn=el('menuBtn');
  if(window.innerWidth>900){
    const collapsed=document.body.classList.contains('sidebar-collapsed');
    btn.textContent=collapsed?'›':'‹';
    btn.title=collapsed?'Ouvrir le menu':'Rétracter le menu';
    btn.setAttribute('aria-label',btn.title);
  }else{
    btn.textContent='☰';
    btn.title='Ouvrir le menu';
    btn.setAttribute('aria-label',btn.title);
  }
}
el('menuBtn').onclick=()=>{
if(window.innerWidth>900){
document.body.classList.toggle('sidebar-collapsed');
localStorage.setItem('sidebarCollapsed',document.body.classList.contains('sidebar-collapsed'));
updateMenuButton();
setTimeout(syncInventoryTopScrollbar,220);
}else{
el('sidebar').classList.toggle('open');
}
};
if(localStorage.getItem('sidebarCollapsed')==='true'&&window.innerWidth>900){
document.body.classList.add('sidebar-collapsed');
}
updateMenuButton();
window.addEventListener('resize',updateMenuButton);

init();setTimeout(syncInventoryTopScrollbar,0);

function enableColumnResize(){
  const table=document.querySelector('#inventoryTableWrap table');
  if(!table)return;

  const headers=[...table.querySelectorAll('thead th')];
  if(!headers.length)return;

  let colgroup=table.querySelector('colgroup[data-resizable="1"]');
  if(!colgroup){
    colgroup=document.createElement('colgroup');
    colgroup.dataset.resizable='1';
    headers.forEach((th,i)=>{
      const col=document.createElement('col');
      const saved=Number(localStorage.getItem('inventory_col_'+i));
      col.style.width=(saved||Math.ceil(th.getBoundingClientRect().width))+'px';
      colgroup.appendChild(col);
    });
    table.insertBefore(colgroup,table.firstChild);
  }

  const cols=[...colgroup.children];
  const updateTableWidth=()=>{
    const total=cols.reduce((sum,col)=>sum+(parseFloat(col.style.width)||80),0);
    table.style.width=total+'px';
    table.style.minWidth=total+'px';
    syncInventoryTopScrollbar();
  };
  updateTableWidth();

  headers.forEach((th,i)=>{
    if(i===headers.length-1||th.querySelector('.col-resizer'))return;
    th.style.position='relative';
    const handle=document.createElement('div');
    handle.className='col-resizer';
    handle.title='Glisser pour redimensionner la colonne';

    handle.addEventListener('pointerdown',e=>{
      e.preventDefault();
      e.stopPropagation();
      handle.setPointerCapture?.(e.pointerId);
      document.body.classList.add('is-resizing-column');
      handle.classList.add('active');

      const startX=e.clientX;
      const startW=parseFloat(cols[i].style.width)||th.getBoundingClientRect().width;

      const move=ev=>{
        const width=Math.max(70,Math.round(startW+ev.clientX-startX));
        cols[i].style.width=width+'px';
        localStorage.setItem('inventory_col_'+i,String(width));
        updateTableWidth();
      };
      const stop=()=>{
        document.removeEventListener('pointermove',move);
        document.removeEventListener('pointerup',stop);
        document.removeEventListener('pointercancel',stop);
        document.body.classList.remove('is-resizing-column');
        handle.classList.remove('active');
      };
      document.addEventListener('pointermove',move);
      document.addEventListener('pointerup',stop,{once:true});
      document.addEventListener('pointercancel',stop,{once:true});
    });
    th.appendChild(handle);
  });
});
}
