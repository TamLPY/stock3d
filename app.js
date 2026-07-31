/* global supabase */
const cfg = window.STOCK3D_CONFIG || {};
const configured = cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes('VOTRE-PROJET');
const el = (id) => document.getElementById(id);
const state = { products: [], categories: [], technicians: [], movements: [], channel: null };
let db;
const euro = (n) => new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(n||0));
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
  el('statProducts').textContent=state.products.length;el('statValue').textContent=euro(state.products.reduce((a,p)=>a+Number(p.stock)*Number(p.unit_price),0));el('statLow').textContent=low.length;el('statOut').textContent=out.length;
  el('dashboardAlerts').innerHTML=[...out,...low].slice(0,8).map(p=>`<div class="alert-row"><span class="badge ${status(p)[0]}">${status(p)[1]}</span><div class="row-main"><strong>${esc(p.name)}</strong><small>Stock : ${p.stock} · seuil : ${p.alert_threshold}</small></div></div>`).join('')||'<div class="empty">Aucune alerte</div>';
  el('recentMovements').innerHTML=state.movements.slice(0,8).map(m=>movementCard(m)).join('')||'<div class="empty">Aucun mouvement</div>';
}
function filtered(){const q=el('searchInput').value.toLowerCase(),cat=el('categoryFilter').value,st=el('statusFilter').value;return state.products.filter(p=>(!q||[p.supplier_reference,p.internal_reference,p.name,p.description,p.supplier,p.target_pest].join(' ').toLowerCase().includes(q))&&(!cat||p.category_id===cat)&&(!st||status(p)[0]===st));}
function renderInventory(){const list=filtered();el('inventoryCount').textContent=`${list.length} produit${list.length>1?'s':''}`;el('inventoryValue').textContent=euro(list.reduce((a,p)=>a+Number(p.stock)*Number(p.unit_price),0));el('inventoryBody').innerHTML=list.map(p=>{const [k,l]=status(p);return `<tr><td>${esc(p.supplier_reference)||'—'}</td><td><div class="actions"><button class="stock-btn plus" onclick="openMovement('${p.id}','entry')">+</button><button class="stock-btn minus" onclick="openMovement('${p.id}','exit')">−</button></div></td><td><div class="product-name"><strong>${esc(p.name)}</strong><small>${esc(p.description)||'—'}</small></div></td><td>${esc(p.categories?.name)||'—'}</td><td>${esc(p.supplier)||'—'}</td><td>${esc(p.target_pest)||'—'}</td><td><strong>${p.stock}</strong></td><td>${euro(p.unit_price)}</td><td><strong>${euro(Number(p.stock)*Number(p.unit_price))}</strong></td><td><span class="badge ${k}">${l}</span></td><td><div class="actions"><button class="edit-btn" onclick="openProduct('${p.id}')">Modifier</button></div></td></tr>`}).join('')||'<tr><td colspan="11" class="empty">Aucun produit</td></tr>'}
function movementCard(m){return `<div class="movement-row"><span class="badge ${m.movement_type}">${m.movement_type==='entry'?'Entrée':'Sortie'}</span><div class="row-main"><strong>${esc(m.products?.name||'Produit')}</strong><small>${m.quantity} · ${esc(m.technicians?.name||'—')} · ${dt(m.created_at)}</small></div></div>`}
function renderMovements(){el('movementsBody').innerHTML=state.movements.map(m=>`<tr><td>${dt(m.created_at)}</td><td>${esc(m.products?.internal_reference)||'—'}</td><td>${esc(m.products?.name)||'—'}</td><td><span class="badge ${m.movement_type}">${m.movement_type==='entry'?'Entrée':'Sortie'}</span></td><td>${m.quantity}</td><td>${esc(m.technicians?.name)||'—'}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">Aucun mouvement</td></tr>'}
function renderSettings(){el('categoryList').innerHTML=state.categories.map(x=>`<div class="manage-item"><span>${esc(x.name)}</span><button onclick="deleteCategory('${x.id}')">Supprimer</button></div>`).join('');el('technicianList').innerHTML=state.technicians.map(x=>`<div class="manage-item"><span>${esc(x.name)}</span><button onclick="deleteTechnician('${x.id}')">Supprimer</button></div>`).join('')}
function populateFilters(){const v=el('categoryFilter').value;el('categoryFilter').innerHTML='<option value="">Toutes les catégories</option>'+state.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');el('categoryFilter').value=v}

function modal(title,eyebrow,html){el('modalTitle').textContent=title;el('modalEyebrow').textContent=eyebrow;el('modalContent').innerHTML=html;el('modalBackdrop').classList.remove('hidden')}
function closeModal(){el('modalBackdrop').classList.add('hidden')}
window.openProduct=function(id=''){const p=state.products.find(x=>x.id===id)||{};modal(id?'Modifier le produit':'Ajouter un produit','FICHE PRODUIT',`<form id="productForm"><div class="form-grid"><label>Référence fournisseur<input name="supplier_reference" value="${esc(p.supplier_reference)}"></label><label>Référence interne<input name="internal_reference" required value="${esc(p.internal_reference)}"></label><label>Nom du produit<input name="name" required value="${esc(p.name)}"></label><label>Description<input name="description" value="${esc(p.description)}"></label><label>Catégorie<select name="category_id"><option value="">—</option>${state.categories.map(c=>`<option value="${c.id}" ${p.category_id===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label>Fournisseur<input name="supplier" value="${esc(p.supplier)}"></label><label>Nuisible ciblé<input name="target_pest" value="${esc(p.target_pest)}"></label><label>Stock<input name="stock" type="number" min="0" step="0.01" required value="${p.stock??0}"></label><label>Seuil d’alerte<input name="alert_threshold" type="number" min="0" step="0.01" required value="${p.alert_threshold??0}"></label><label>Prix unitaire (€)<input name="unit_price" type="number" min="0" step="0.01" required value="${p.unit_price??0}"></label></div><div class="form-actions">${id?'<button type="button" id="deleteProductBtn" class="btn danger">Supprimer</button>':''}<button type="button" class="btn secondary" id="cancelModal">Annuler</button><button class="btn primary">Enregistrer</button></div></form>`);el('cancelModal').onclick=closeModal;el('productForm').onsubmit=async(e)=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));['stock','alert_threshold','unit_price'].forEach(k=>data[k]=Number(data[k]));data.category_id=data.category_id||null;const q=id?db.from('products').update(data).eq('id',id):db.from('products').insert(data);const {error}=await q;if(error)toast(error.message);else{closeModal();toast('Produit enregistré')}};if(id)el('deleteProductBtn').onclick=()=>deleteProduct(id)}
window.openMovement=function(id,type){const p=state.products.find(x=>x.id===id);const isExit=type==='exit';modal(`${isExit?'Sortie':'Entrée'} — ${p.name}`,isExit?'STOCK SORTANT':'STOCK ENTRANT',`<form id="movementForm" class="movement-form"><label>Quantité<input name="quantity" type="number" min="0.01" step="0.01" required autofocus></label>${isExit?`<label>Technicien<select name="technician_id" required><option value="">Sélectionner…</option>${state.technicians.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label>`:''}<div class="form-actions"><button type="button" class="btn secondary" id="cancelModal">Annuler</button><button class="btn ${isExit?'danger':'primary'}">Valider</button></div></form>`);el('cancelModal').onclick=closeModal;el('movementForm').onsubmit=async(e)=>{e.preventDefault();const f=new FormData(e.target);const {error}=await db.rpc('change_stock',{p_product_id:id,p_type:type,p_quantity:Number(f.get('quantity')),p_technician_id:f.get('technician_id')||null});if(error)toast(error.message);else{closeModal();toast('Stock mis à jour')}}}
window.deleteProduct=async function(id){if(!confirm('Supprimer ce produit ?'))return;const {error}=await db.from('products').delete().eq('id',id);if(error)toast(error.message);else{closeModal();toast('Produit supprimé')}}
window.deleteCategory=async function(id){if(!confirm('Supprimer cette catégorie ? Les produits resteront présents.'))return;const {error}=await db.from('categories').delete().eq('id',id);if(error)toast(error.message)}
window.deleteTechnician=async function(id){if(!confirm('Retirer ce technicien de la liste ?'))return;const {error}=await db.from('technicians').update({active:false}).eq('id',id);if(error)toast(error.message)}

el('closeModal').onclick=closeModal;el('modalBackdrop').onclick=e=>{if(e.target===el('modalBackdrop'))closeModal()};el('addProductTop').onclick=()=>openProduct();
['searchInput','categoryFilter','statusFilter'].forEach(id=>el(id).addEventListener(id==='searchInput'?'input':'change',renderInventory));
el('categoryForm').onsubmit=async e=>{e.preventDefault();const name=el('newCategory').value.trim();if(!name)return;const {error}=await db.from('categories').insert({name});if(error)toast(error.message);else{el('newCategory').value='';toast('Catégorie ajoutée')}};
el('technicianForm').onsubmit=async e=>{e.preventDefault();const name=el('newTechnician').value.trim();if(!name)return;const {error}=await db.from('technicians').insert({name});if(error)toast(error.message);else{el('newTechnician').value='';toast('Technicien ajouté')}};
document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>{document.querySelectorAll('.nav-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));el(`${b.dataset.view}View`).classList.add('active');el('pageTitle').textContent=b.querySelector('span').textContent;el('sidebar').classList.remove('open')});
el('menuBtn').onclick=()=>el('sidebar').classList.toggle('open');
init();
