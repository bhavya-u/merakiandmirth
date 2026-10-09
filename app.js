const $ = selector => document.querySelector(selector);
const money = value => {
  const amount = Number(value || 0);
  return `₹ ${amount.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;
};
const defaultOccasionTypes = [
  { code: 'all', label: 'All occasions', sort_order: 10 }, { code: 'wedding', label: 'Wedding', sort_order: 20 }, { code: 'baby_shower', label: 'Baby shower', sort_order: 30 }, { code: 'birthday', label: 'Birthday', sort_order: 40 }, { code: 'kids_events', label: 'Kids’ events', sort_order: 45 }, { code: 'naming_ceremony', label: 'Naming ceremony', sort_order: 50 }, { code: 'housewarming', label: 'Housewarming', sort_order: 60 }, { code: 'pooja', label: 'Pooja', sort_order: 70 }, { code: 'lifestyle_events', label: 'Lifestyle Events', sort_order: 75 }, { code: 'ladies_events', label: 'Ladies’ events', sort_order: 77 }, { code: 'corporate_gifting', label: 'Corporate gifting', sort_order: 80 }, { code: 'teachers_day', label: 'Teacher’s Day', sort_order: 85 }, { code: 'diwali_festivals', label: 'Diwali & festivals', sort_order: 90 }, { code: 'return_gift', label: 'Simple return gift', sort_order: 100 }, { code: 'anniversary', label: 'Anniversary', sort_order: 110 }, { code: 'farewell', label: 'Farewell', sort_order: 120 }
];
let occasionTypes = defaultOccasionTypes;
const tags = () => occasionTypes.map(item => item.code);
const tagLabel = tag => occasionTypes.find(item => item.code === normalizeTag(tag))?.label || String(tag || '').replace(/_/g, ' ');
const normalizeTag = value => {
  const text = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ['all', 'all_occasions', 'all_events'].includes(text) ? 'all' : text;
};
const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const MAX_COMBO_PRODUCTS = 12;
const COMBO_COLLAGE_PRODUCTS = 6;
const config = window.SUPABASE_CONFIG;
const browserFetch = window.fetch.bind(window);
const workspaceReadControllers = new Set();
let workspaceReadCooldownUntil = 0;
async function fetchWorkspaceRead(resource, options) {
  if (Date.now() < workspaceReadCooldownUntil) return new Response(JSON.stringify({ message: 'Workspace reads are temporarily paused after a quota or rate limit. Please try again shortly.' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  const controller = new AbortController();
  const supplied = options.signal || (resource instanceof Request ? resource.signal : null);
  const abort = () => controller.abort();
  if (supplied?.aborted) abort();
  supplied?.addEventListener('abort', abort, { once: true });
  workspaceReadControllers.add(controller);
  const timeout = setTimeout(abort, 20000);
  try {
    const response = await browserFetch(resource, { ...options, signal: controller.signal });
    if ([402,429].includes(response.status)) workspaceReadCooldownUntil = Date.now() + 30000;
    return response;
  } finally { clearTimeout(timeout); supplied?.removeEventListener('abort', abort); workspaceReadControllers.delete(controller); }
}
window.fetch = async (resource, options = {}) => {
  const requestUrl = resource instanceof Request ? resource.url : String(resource);
  const method = (options.method || (resource instanceof Request ? resource.method : 'GET')).toUpperCase();
  const isReadOnlyRpc = /\/rest\/v1\/rpc\/(workspace_access_state|workspace_expense_people|workspace_expense_summary|workspace_order_summary|workspace_client_order_summary)(?:\?|$)/.test(requestUrl);
  const isSupabaseWrite = !isReadOnlyRpc && /\/((rest|storage|functions)\/v1)\//.test(requestUrl) && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  if (requestUrl.startsWith(`${config?.url}/rest/v1/`) && (method === 'GET' || isReadOnlyRpc)) return fetchWorkspaceRead(resource, options);
  if (!isSupabaseWrite) return browserFetch(resource, options);
  const message = requestUrl.includes('/storage/v1/') ? 'Uploading image…' : requestUrl.includes('/functions/v1/') ? 'Sending update…' : 'Saving changes…';
  setDatabaseUpdateState(true, message);
  try { return await browserFetch(resource, options); } finally { setDatabaseUpdateState(false); }
};
const db = config?.url && config?.anonKey && window.supabase ? window.supabase.createClient(config.url, config.anonKey) : null;

let products = [];
let combos = [];
let orders = [];
let user = null;
let accessGranted = false;
let selectedProducts = new Set();
let editingCombo = null;
let editingProduct = null;
let selectedExportCombos = new Set();
let libraryEvent = 'all_products';
let librarySearch = '';
let librarySort = 'name-asc';
let studioProductSearch = '';
let studioBudgetMin = '';
let studioBudgetMax = '';
let studioProductSort = 'name-asc';
let studioProductOccasion = 'all_products';
let studioSortMenuOpen = false;
let studioTab = 'design';
let inventorySearch = '';
let inventoryStatus = 'all';
let inventoryPage = 1;
const inventoryPageSize = 12;
let expenseClaims = [];
let expensePolicies = [];
let expenseAdmins = [];
let clients = [];
let vendors = [];
let contactsTab = 'clients';
let clientSearch = '';
let vendorSearch = '';
let quoteAdditionalCosts = [];
let ordersFrom = currentYearDateRange().from;
let ordersTo = currentYearDateRange().to;
let openOrderId = null;
let databaseUpdateCount = 0;
let productSaveInFlight = false;
const orderStatuses = ['Enquiry', 'Quotation sent', 'Follow-up', 'Confirmed', 'Advance paid', 'Procurement', 'Packaging', 'Ready for dispatch', 'Out for delivery', 'Delivered', 'Full amount paid', 'Closed', 'Lost', 'Dropped'];
const profitStatuses = new Set(['Full amount paid', 'Closed']);

function escapeHtml(value = '') { const el = document.createElement('span'); el.textContent = value; return el.innerHTML; }
function imageSource(image = '', variant = 'grid') { image = ProductImages.source(image, variant); return image.startsWith('assets/catalogue/') ? image.replace('assets/catalogue/', 'assets/catalogue-webp/').replace(/\.png$/i, '.webp') : image; }
function imageMarkup(product, className = '', variant = 'grid') { const print = className.includes('catalogue-product') || className.includes('print-quote'); const source = imageSource(product?.image || '', print ? 'export' : className === 'product-detail-photo' ? 'detail' : variant); return source ? `<img class="${className}" ${print ? 'src' : 'data-image-src'}="${escapeHtml(source)}" decoding="async" alt="${escapeHtml(product.name)}">` : `<div class="${className} image-fallback">${escapeHtml(product?.name?.slice(0, 1) || 'M')}</div>`; }
function pickerImageMarkup(product) { const source = imageSource(product?.image || '', 'thumb'); const content = source ? `<img class="picker-image" decoding="async" data-image-src="${escapeHtml(source)}" alt="${escapeHtml(product.name)}">` : `<span class="picker-image image-fallback">${escapeHtml(product?.name?.slice(0, 1) || 'M')}</span>`; return `<span class="picker-image-frame">${content}</span>`; }
function notify(message, type = 'error') { const region = $('#toastRegion'); if (!region) return window.alert(message); const toast = document.createElement('div'); toast.className = `toast ${type === 'success' ? 'success' : 'error'}`; toast.setAttribute('role', type === 'success' ? 'status' : 'alert'); toast.textContent = message; region.append(toast); setTimeout(() => { toast.classList.add('leaving'); setTimeout(() => toast.remove(), 180); }, 4200); }
function setDatabaseUpdateState(active, message = 'Saving changes…') { const overlay = $('#databaseSaving'); if (!overlay) return; databaseUpdateCount = Math.max(0, databaseUpdateCount + (active ? 1 : -1)); if (active) $('#databaseSavingMessage').textContent = message; overlay.hidden = databaseUpdateCount === 0; document.body.classList.toggle('database-update-pending', databaseUpdateCount > 0); }
async function runDatabaseUpdate(message, work) { setDatabaseUpdateState(true, message); try { return await work(); } finally { setDatabaseUpdateState(false); } }
function assertAccess() { if (!accessGranted) { notify('Sign in with an approved email and password first.'); return false; } return true; }
function parseContents(value) { try { return JSON.parse(value || '{}'); } catch { return {}; } }
function roundedProductPrice(cost, buffer) { return Math.round(Math.max(0, Number(cost || 0)) + Math.max(0, Number(buffer || 0))); }
function productFromRow(row) { const baseCost = Number(row.cost || 0), buffer = Number(row.buffer || 0), rate = row.rounded_price == null ? roundedProductPrice(baseCost, buffer) : Number(row.rounded_price); return { id: row.id, sku: row.sku || row.id, name: row.name, baseCost, buffer, rate, events: (row.occasions?.length ? row.occasions : ['all']).map(normalizeTag), image: row.photo || '', stockOnHand: Number(row.stock_on_hand || 0), reorderLevel: Number(row.reorder_level || 0), supplier: row.supplier_name || '', leadTimeDays: Number(row.lead_time_days || 0), createdAt: row.created_at || '' }; }
function comboFromRow(row) { const meta = parseContents(row.contents); return { id: row.id, occasion: row.occasions?.[0] || '', name: row.name, rate: Number(row.cost || 0), margin: Number(meta.margin ?? 30), productIds: row.component_ids || [] }; }
function orderFromRow(row) { const primary = row.items?.[0] || {}; const comboId = row.combo_id || primary.comboId || ''; const combo = combos.find(item => item.id === comboId); const quantity = Number(row.qty || 0); const unitCost = Number(primary.unitCost ?? (combo ? comboCost(combo.productIds) : 0)); const costSnapshot = Number(row.cost_snapshot || unitCost * quantity); const expensesTotal = Number(row.expenses_total || 0); const profit = Number(row.total) - costSnapshot - expensesTotal; const profitRealised = profitStatuses.has(row.status); const additionalCosts = (row.additional_costs || primary.additionalCosts || []).map(item => ({ label: String(item.label || 'Additional cost'), amount: Math.max(0, Number(item.amount || 0)) })).filter(item => item.amount > 0); return { id: row.id, clientId: row.client_id || '', code: row.code, comboId, comboName: primary.comboName || combo?.name || row.title, title: row.title, occasion: row.event, quantity, total: Number(row.total), status: row.status, customerName: row.customer_name || '', customerPhone: row.customer_phone || '', deliveryArea: row.delivery_area || '', specialRequest: row.special_request || '', complimentary: row.complimentary || primary.complimentary || '', eventDate: row.event_date || primary.eventDate || '', deliveryDate: row.delivery_date || primary.deliveryDate || '', netWrapping: Boolean(row.net_wrapping ?? primary.netWrapping), netWrappingUnitPrice: Number(row.net_wrapping_unit_price ?? primary.netWrappingUnitPrice ?? 0), additionalCosts, thankYouCardCode: row.thank_you_card_code || primary.thankYouCardCode || '', thankYouCardStyle: row.thank_you_card_style || primary.thankYouCardStyle || 'none', thankYouCardUnitPrice: Number(row.thank_you_card_unit_price ?? primary.thankYouCardUnitPrice ?? 0), thankYouCardDesignFee: Number(row.thank_you_card_design_fee ?? primary.thankYouCardDesignFee ?? 0), discountPercent: Number(row.discount_percent ?? primary.discountPercent ?? 0), discountAmount: Number(row.discount_amount ?? primary.discountAmount ?? 0), subtotalBeforeDiscount: Number(row.subtotal_before_discount ?? primary.subtotalBeforeDiscount ?? row.total ?? 0), quoteSentAt: row.quote_sent_at || '', createdAt: row.created_at, created: new Date(row.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }), costSnapshot, expensesTotal, profit, profitRealised }; }
function productMatchesEvent(product, event) { const tag = normalizeTag(event); return tag === 'all_products' || product.events.includes('all') || product.events.includes(tag); }
function currentOccasion() { return $('#occasion').value; }
function uniqueOccasions() { return [...new Set(combos.map(combo => normalizeTag(combo.occasion)).filter(Boolean))]; }
function tableOccasions() { return tags(); }
function syncOccasionLists() {
  const studio = $('#occasion'); const catalogue = $('#catalogueOccasion'); const libraryFilter = $('#libraryEventFilter'); const studioProductFilter = $('#studioProductOccasion'); const manage = $('#manageComboOccasion'); const quoteOccasion = $('#quoteOccasion');
  if (!studio || !catalogue || !libraryFilter || !studioProductFilter || !manage || !quoteOccasion) return;
  const studioValue = studio.value;
  const catalogueValue = catalogue.value;
  const manageValue = manage.value;
  const quoteValue = quoteOccasion.value;
  const options = [...new Set([...tableOccasions(), ...uniqueOccasions()])];
  const markup = options.map(tag => `<option value="${escapeHtml(tag)}">${escapeHtml(tagLabel(tag))}</option>`).join('');
  studio.innerHTML = `<option value="">Choose an occasion</option>${markup}`;
  catalogue.innerHTML = `<option value="all_combos">All catalogues</option>${markup}`;
  const manageMarkup = options.map(tag => `<option value="${escapeHtml(tag)}">${escapeHtml(tag === 'all' ? 'Tagged for all occasions' : tagLabel(tag))}</option>`).join('');
  manage.innerHTML = `<option value="all_combos">All saved combos</option>${manageMarkup}`;
  quoteOccasion.innerHTML = `<option value="all_combos">All saved combos</option>${manageMarkup}`;
  studio.value = options.includes(studioValue) ? studioValue : '';
  catalogue.value = catalogueValue === 'all_combos' || options.includes(catalogueValue) ? catalogueValue : 'all_combos';
  manage.value = manageValue === 'all_combos' || options.includes(manageValue) ? manageValue : 'all_combos';
  quoteOccasion.value = quoteValue === 'all_combos' || options.includes(quoteValue) ? quoteValue : 'all_combos';
  libraryFilter.innerHTML = [`<option value="all_products">All products</option>`, ...tableOccasions().map(tag => `<option value="${tag}">${tagLabel(tag)}</option>`)].join('');
  libraryFilter.value = tableOccasions().includes(libraryEvent) || libraryEvent === 'all_products' ? libraryEvent : 'all_products';
  studioProductFilter.innerHTML = [`<option value="all_products">All products</option>`, ...tableOccasions().map(tag => `<option value="${tag}">${tagLabel(tag)}</option>`)].join('');
  studioProductOccasion = tableOccasions().includes(studioProductOccasion) || studioProductOccasion === 'all_products' ? studioProductOccasion : 'all_products';
  studioProductFilter.value = studioProductOccasion;
}

let orderSummary = { count: 0, packing: 0, delivered: 0, converted: 0, qualifying: 0, profit: 0 };
let orderHasMore = false, orderPageLoading = false, orderRevision = 0;
function orderBaseQuery() { return db.from('orders').select('id,client_id,code,title,event,qty,total,status,items,additional_costs,created_at,customer_name,customer_phone,delivery_area,special_request,complimentary,event_date,delivery_date,net_wrapping,net_wrapping_unit_price,thank_you_card_code,thank_you_card_style,thank_you_card_unit_price,thank_you_card_design_fee,discount_percent,discount_amount,subtotal_before_discount,quote_sent_at,cost_snapshot,expenses_total'); }
function orderPageQuery(after) {
  let query = orderBaseQuery().order('created_at', { ascending: false }).order('id', { ascending: false }).limit(51);
  if (ordersFrom) query = query.gte('created_at', `${ordersFrom}T00:00:00Z`);
  if (ordersTo) { const end = new Date(`${ordersTo}T00:00:00Z`); end.setUTCDate(end.getUTCDate()+1); query = query.lt('created_at',end.toISOString()); }
  if (after) query = query.or(`created_at.lt.${after.created_at},and(created_at.eq.${after.created_at},id.lt.${after.id})`);
  return query;
}
async function loadMoreOrders() {
  if (!accessGranted || orderPageLoading || !orderHasMore) return;
  const epoch = dataEpoch, revision = orderRevision, from = ordersFrom, to = ordersTo;
  orderPageLoading = true; renderOrders();
  try {
    const result = await orderPageQuery(rawOrderRows.at(-1));
    if (epoch !== dataEpoch || revision !== orderRevision || from !== ordersFrom || to !== ordersTo) return;
    if (result.error) throw result.error;
    const known = new Set(rawOrderRows.map(row => row.id));
    rawOrderRows.push(...result.data.slice(0,50).filter(row => !known.has(row.id)));
    orders = rawOrderRows.map(orderFromRow); orderHasMore = result.data.length > 50;
  } catch (error) { notify(`Could not load more orders: ${error.message}`); }
  finally { orderPageLoading = false; renderOrders(); }
}
function refreshOrderRange() {
  orderRevision++;
  void hydrateFromSupabase(['orders']).catch(error => notify(`Could not refresh orders: ${error.message}`));
}
const expenseFields = 'id,submitted_by_id,submitted_by_name,expense_type,description,vendor,delivery_mode,delivery_provider,distance_km,rate_per_km,amount,note,approval_status,approved_by_name,settled_at,created_at';
let expenseSummary = { count: 0, pending: 0, approved: 0, settled: 0, people: [] };
let expenseHasMore = false;
let expensePageLoading = false;
let expenseRevision = 0;
function expensePageQuery(after) {
  let query = db.from('expense_claims').select(expenseFields).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(51);
  if (after) query = query.or(`created_at.lt.${after.created_at},and(created_at.eq.${after.created_at},id.lt.${after.id})`);
  return query;
}
async function loadMoreExpenses() {
  if (expensePageLoading || !expenseHasMore || !accessGranted) return;
  const epoch = dataEpoch, revision = expenseRevision;
  expensePageLoading = true; renderExpenses();
  try {
    const result = await expensePageQuery(expenseClaims.at(-1));
    if (epoch !== dataEpoch || revision !== expenseRevision) return;
    if (result.error) throw result.error;
    const known = new Set(expenseClaims.map(row => row.id));
    expenseClaims.push(...result.data.slice(0, 50).filter(row => !known.has(row.id)));
    expenseHasMore = result.data.length > 50;
  } catch (error) { notify(`Could not load more expenses: ${error.message}`); }
  finally { expensePageLoading = false; renderExpenses(); }
}
const viewData = {
  studio: ['items', 'occasions'], library: ['items', 'occasions', 'vendors'],
  catalogues: ['items', 'occasions'], quotes: ['items', 'occasions', 'clients'],
  orders: ['items', 'occasions', 'orders'], contacts: ['items', 'clients', 'vendors'],
  inventory: ['items'], expenses: ['expenses', 'policies', 'people']
};
let dataEpoch = 0;
let rawOrderRows = [];
const datasetReadTimes = new Map();
const datasetKey = key => key === 'orders' ? `orders:${ordersFrom}:${ordersTo}` : key;
let hydrationQueue = Promise.resolve();
function hydrateFromSupabase(groups = Object.keys(dataQueries()), { reuse = false } = {}) {
  const epoch = dataEpoch;
  const work = async () => {
    if (epoch !== dataEpoch || !accessGranted) return;
    const queries = dataQueries();
    const selected = [...new Set(groups)].filter(key => !reuse || Date.now() - (datasetReadTimes.get(datasetKey(key)) || 0) >= 30000);
    if (!selected.length) return;
    const responses = await Promise.all(selected.map(async key => [key, await queries[key]()]));
    if (epoch !== dataEpoch || !accessGranted) return;
    const failure = responses.find(([, result]) => result.error);
    if (failure) throw new Error(failure[1].error.message);
    const results = Object.fromEntries(responses.map(([key, result]) => [key, result.data || []]));
    if (results.orders && (results.orders.from !== ordersFrom || results.orders.to !== ordersTo)) return;
    if (results.occasions) occasionTypes = results.occasions.length ? results.occasions : defaultOccasionTypes;
    if (results.items) {
      products = results.items.filter(row => row.kind === 'product').map(productFromRow);
      combos = results.items.filter(row => row.kind === 'combo').map(comboFromRow);
    }
    if (results.orders) { rawOrderRows = results.orders.rows; orderSummary = results.orders.summary; orderHasMore = results.orders.more; orderRevision++; }
    if (results.orders || results.items) orders = rawOrderRows.map(orderFromRow);
    if (results.expenses) { expenseClaims = results.expenses.rows; expenseHasMore = results.expenses.more; expenseSummary = results.expenses.summary; expenseRevision++; }
    if (results.policies) expensePolicies = results.policies;
    if (results.people) expenseAdmins = results.people;
    if (results.clients) clients = results.clients;
    if (results.vendors) vendors = results.vendors;
    selected.forEach(key => datasetReadTimes.set(datasetKey(key), Date.now()));
    syncOccasionLists();
    renderAll();
  };
  // Serialize refreshes so an older read cannot overwrite a later edit's refresh.
  const task = hydrationQueue.then(work, work);
  hydrationQueue = task.catch(() => {});
  return task;
}
async function fetchAllMetadata(makeQuery, key = 'id') {
  const epoch = dataEpoch, rows = [];
  let cursor = null;
  while (true) {
    if (epoch !== dataEpoch || !accessGranted) return { error: { message: 'Workspace session changed.' }, data: null };
    let query = makeQuery().order(key, { ascending: true }).limit(500);
    if (cursor !== null) query = query.gt(key, cursor);
    const result = await query;
    if (result.error) return { error: result.error, data: null };
    const page = result.data || [];
    rows.push(...page);
    if (page.length < 500) return { data: rows, error: null };
    const next = page.at(-1)[key];
    if (next === cursor || next == null) return { error: { message: 'Could not advance the catalogue cursor.' }, data: null };
    cursor = next;
  }
}
function dataQueries() {
  return {
    items: async () => { const result = await fetchAllMetadata(() => db.from('library_items').select('id,kind,name,cost,buffer,rounded_price,contents,component_ids,occasions,photo,sku,stock_on_hand,reorder_level,supplier_name,lead_time_days,created_at')); result.data?.sort((a,b) => a.name.localeCompare(b.name)); return result; },
    orders: async () => { const from = ordersFrom, to = ordersTo; const [page, summary] = await Promise.all([orderPageQuery(), db.rpc('workspace_order_summary', { p_from: from || null, p_to: to || null })]); return { error: page.error || summary.error, data: { rows: (page.data || []).slice(0,50), more: (page.data || []).length > 50, summary: summary.data, from, to } }; },
    occasions: () => db.from('occasion_types').select('code,label,sort_order').eq('active', true).order('sort_order'),
    expenses: async () => { const [page, summary] = await Promise.all([expensePageQuery(), db.rpc('workspace_expense_summary')]); return { error: page.error || summary.error, data: { rows: (page.data || []).slice(0, 50), more: (page.data || []).length > 50, summary: summary.data } }; },
    policies: () => db.from('expense_rate_policies').select('delivery_mode,fuel_price_per_litre,kilometres_per_litre').eq('active', true),
    people: () => db.rpc('workspace_expense_people'),
    clients: async () => { const [list, summary] = await Promise.all([fetchAllMetadata(() => db.from('clients').select('id,name,mobile_number,delivery_area,created_at,updated_at')), fetchAllMetadata(() => db.rpc('workspace_client_order_summary'), 'client_id')]); list.data?.sort((a,b) => b.updated_at.localeCompare(a.updated_at)); const counts = new Map((summary.data || []).map(row => [row.client_id,row])); return { error: list.error || summary.error, data: (list.data || []).map(row => ({ ...row, orderSummary: counts.get(row.id) })) }; },
    vendors: async () => { const result = await fetchAllMetadata(() => db.from('vendors').select('id,name,phone,email,address,notes,created_at,updated_at')); result.data?.sort((a,b) => a.name.localeCompare(b.name)); return result; },
  };
}

async function updateAccess(session) {
  dataEpoch++;
  datasetReadTimes.clear();
  workspaceReadControllers.forEach(controller => controller.abort());
  navigationRequest++;
  const accessEpoch = dataEpoch;
  rawOrderRows = []; orderHasMore = false; orderRevision++; orderSummary = { count: 0, packing: 0, delivered: 0, converted: 0, qualifying: 0, profit: 0 };
  products = []; combos = []; orders = []; clients = []; vendors = [];
  expenseSummary = { count: 0, pending: 0, approved: 0, settled: 0, people: [] }; expenseHasMore = false; expenseRevision++;
  expenseClaims = []; expensePolicies = []; expenseAdmins = [];
  user = session?.user || null;
  accessGranted = false;
  document.body.classList.remove('auth-pending', 'auth-blocked');
  if (!db) {
    document.body.classList.add('auth-blocked');
    $('#authMessage').textContent = 'Supabase is not configured for this site.';
    $('#passwordSignIn').hidden = true;
    return;
  }
  if (!user) {
    document.body.classList.add('auth-pending');
    $('#authMessage').textContent = 'Sign in with your approved email and password to manage the catalogue and orders.';
    $('#passwordSignIn').hidden = false;
    $('#claimWorkspace').hidden = true;
    $('#signOut').hidden = true;
    return;
  }
  const { data, error } = await db.rpc('workspace_access_state');
  if (accessEpoch !== dataEpoch) return;
  if (error) throw new Error(error.message);
  if (data.member) {
    accessGranted = true;
    $('#signedInAs').textContent = user.email || '';
    await hydrateFromSupabase(viewData[document.querySelector('.view.active')?.id] || viewData.studio);
    return;
  }
  document.body.classList.add('auth-blocked');
  $('#authMessage').textContent = data.unclaimed
    ? `Signed in as ${user.email}. This is a new workspace — claim it only if you are the owner.`
    : `${user.email} is not approved for this workspace. Ask the owner to add your email.`;
  $('#passwordSignIn').hidden = true;
  $('#claimWorkspace').hidden = !data.unclaimed;
  $('#signOut').hidden = false;
}

async function signInWithPassword(form) {
  if (!db) return;
  const { error } = await db.auth.signInWithPassword({ email: form.elements.email.value.trim().toLowerCase(), password: form.elements.password.value });
  if (error) notify(error.message);
}
async function signOut() { await db.auth.signOut(); await updateAccess(null); }
async function claimWorkspace() {
  const { error } = await db.rpc('claim_workspace_owner');
  if (error) return notify(error.message);
  await updateAccess((await db.auth.getSession()).data.session);
}

let navigationRequest = 0;
async function navigate(view) {
  if (!viewData[view] || !accessGranted) return;
  const request = ++navigationRequest;
  try { await hydrateFromSupabase(viewData[view], { reuse: true }); }
  catch (error) { notify(`Could not load this screen: ${error.message}`); return; }
  if (request !== navigationRequest || !accessGranted) return;
  document.querySelectorAll('.nav,.view').forEach(node => node.classList.remove('active'));
  document.querySelectorAll(`.nav[data-view="${view}"]`).forEach(node => node.classList.add('active')); $(`#${view}`).classList.add('active');
  renderAll();
}

function setContactsTab(tab) { contactsTab = tab === 'vendors' ? 'vendors' : 'clients'; document.querySelectorAll('[data-contacts-tab]').forEach(button => { const active = button.dataset.contactsTab === contactsTab; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); }); document.querySelectorAll('.contacts-panel').forEach(panel => { const active = panel.id === `contacts${contactsTab[0].toUpperCase()}${contactsTab.slice(1)}`; panel.classList.toggle('active', active); panel.hidden = !active; }); }
function renderContacts() { setContactsTab(contactsTab); $('#productSupplierOptions').innerHTML = vendors.map(vendor => `<option value="${escapeHtml(vendor.name)}"></option>`).join(''); const normalizedClientSearch = clientSearch.trim().toLowerCase(); const visibleClients = clients.filter(client => [client.name, client.mobile_number, client.delivery_area].some(value => String(value || '').toLowerCase().includes(normalizedClientSearch))); $('#clientSearch').value = clientSearch; $('#clientCount').textContent = `${visibleClients.length} client${visibleClients.length === 1 ? '' : 's'}`; $('#clientsTable').innerHTML = visibleClients.map(client => { const stats = client.orderSummary || {}; const latest = stats.latest_title ? { title: stats.latest_title, status: stats.latest_status } : null; return `<tr><td><b>${escapeHtml(client.name)}</b><span>Added ${escapeHtml(formattedDate(String(client.created_at || '').slice(0, 10)) || 'recently')}</span></td><td>${escapeHtml(client.mobile_number)}</td><td>${escapeHtml(client.delivery_area || '—')}</td><td><strong>${stats.order_count || 0}</strong></td><td>${latest ? `<b>${escapeHtml(latest.title)}</b><span>${escapeHtml(latest.status)}</span>` : '—'}</td></tr>`; }).join(''); $('#clientsEmpty').hidden = visibleClients.length > 0; $('#clientsEmpty').textContent = clients.length ? 'No clients match this search.' : 'No clients yet. A client is added automatically when you save a quotation.'; const normalizedVendorSearch = vendorSearch.trim().toLowerCase(); const visibleVendors = vendors.filter(vendor => [vendor.name, vendor.phone, vendor.email, vendor.address].some(value => String(value || '').toLowerCase().includes(normalizedVendorSearch))); $('#vendorSearch').value = vendorSearch; $('#vendorCount').textContent = `${visibleVendors.length} vendor${visibleVendors.length === 1 ? '' : 's'}`; $('#vendorsTable').innerHTML = visibleVendors.map(vendor => { const supplied = products.filter(product => product.supplier.trim().toLowerCase() === vendor.name.trim().toLowerCase()); const contact = [vendor.phone, vendor.email].filter(Boolean).map(escapeHtml).join('<br>') || '—'; return `<tr><td><b>${escapeHtml(vendor.name)}</b>${vendor.notes ? `<span>${escapeHtml(vendor.notes)}</span>` : ''}</td><td>${contact}</td><td>${escapeHtml(vendor.address || '—')}</td><td>${supplied.length ? supplied.map(product => escapeHtml(product.name)).join(', ') : 'Not linked to a product yet'}</td><td><button class="soft-btn" data-vendor-edit="${vendor.id}">Edit</button></td></tr>`; }).join(''); $('#vendorsEmpty').hidden = visibleVendors.length > 0; $('#vendorsEmpty').textContent = vendors.length ? 'No vendors match this search.' : 'No vendors yet. Add a supplier here to keep their details ready for the next purchase.'; document.querySelectorAll('[data-vendor-edit]').forEach(button => button.onclick = () => openVendorDialog(vendors.find(vendor => vendor.id === button.dataset.vendorEdit))); }
function openClientDialog() { if (!assertAccess()) return; const form = $('#clientForm'); form.reset(); $('#clientDialog').showModal(); }
function openVendorDialog(vendor) { if (!assertAccess()) return; const form = $('#vendorForm'); form.reset(); form.dataset.vendorId = vendor?.id || ''; if (vendor) { form.elements.name.value = vendor.name; form.elements.phone.value = vendor.phone || ''; form.elements.email.value = vendor.email || ''; form.elements.address.value = vendor.address || ''; form.elements.notes.value = vendor.notes || ''; } $('#vendorDialog').showModal(); }
async function saveClient(form) { if (!assertAccess()) return; const mobileNumber = form.elements.mobileNumber.value.replace(/\D/g, ''); if (!/^\d{7,15}$/.test(mobileNumber)) throw new Error('Enter a valid client mobile number.'); const { error } = await db.from('clients').upsert({ name: form.elements.name.value.trim(), mobile_number: mobileNumber, delivery_area: form.elements.deliveryArea.value.trim() }, { onConflict: 'mobile_number' }); if (error) throw error; $('#clientDialog').close(); await hydrateFromSupabase(['clients']); notify('Client saved to the shared directory.', 'success'); }
async function saveVendor(form) { if (!assertAccess()) return; const payload = { owner_id: user.id, name: form.elements.name.value.trim(), phone: form.elements.phone.value.trim(), email: form.elements.email.value.trim().toLowerCase(), address: form.elements.address.value.trim(), notes: form.elements.notes.value.trim() }; const id = form.dataset.vendorId; const query = id ? db.from('vendors').update(payload).eq('id', id) : db.from('vendors').insert(payload); const { error } = await query; if (error) throw error; $('#vendorDialog').close(); await hydrateFromSupabase(['vendors']); notify(id ? 'Vendor details updated.' : 'Vendor saved to the shared directory.', 'success'); }

function renderPicker() {
  // The combo occasion is a label for the finished combo, not a restriction on
  // its ingredients. A Birthday combo can include any suitable product.
  const available = products.filter(product => studioProductOccasion === 'all_products' || productMatchesEvent(product, studioProductOccasion));
  const query = studioProductSearch.trim().toLowerCase();
  const minimum = Number(studioBudgetMin || 0);
  const maximum = studioBudgetMax === '' ? Number.POSITIVE_INFINITY : Math.max(0, Number(studioBudgetMax));
  const visible = available
    .filter(product => (!query || product.name.toLowerCase().includes(query)) && product.rate >= minimum && product.rate <= maximum)
    .sort((left, right) => {
      const byName = left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
      const byPrice = Number(left.rate) - Number(right.rate);
      if (studioProductSort === 'name-desc') return -byName;
      if (studioProductSort === 'price-asc') return byPrice || byName;
      if (studioProductSort === 'price-desc') return -byPrice || byName;
      return byName;
    });
  selectedProducts.forEach(id => { if (!products.some(product => product.id === id)) selectedProducts.delete(id); });
  $('#studioProductSearch').value = studioProductSearch;
  $('#studioBudgetMin').value = studioBudgetMin;
  $('#studioBudgetMax').value = studioBudgetMax;
  $('#studioProductOccasion').value = studioProductOccasion;
  $('#studioProductSortToggle').setAttribute('aria-expanded', String(studioSortMenuOpen));
  $('#studioProductSortMenu').hidden = !studioSortMenuOpen;
  document.querySelectorAll('[data-studio-product-sort]').forEach(button => {
    const selected = button.dataset.studioProductSort === studioProductSort;
    button.setAttribute('aria-checked', String(selected));
    button.classList.toggle('active', selected);
  });
  $('#productPicker').innerHTML = visible.map(product => `<button class="picker-product ${selectedProducts.has(product.id) ? 'selected' : ''}" data-id="${product.id}">${pickerImageMarkup(product)}<span class="pick-check">✓</span><b>${escapeHtml(product.name)}</b><small class="picker-product-price">${money(product.rate)}</small><em>${escapeHtml(product.events.map(tagLabel).join(' · '))}</em></button>`).join('');
  $('#pickerEmpty').hidden = visible.length > 0;
  const budgetHint = studioBudgetMin || studioBudgetMax ? ` between ${money(minimum)} and ${maximum === Number.POSITIVE_INFINITY ? 'any price' : money(maximum)}` : '';
  const occasionHint = studioProductOccasion === 'all_products' ? 'all product occasions' : `${tagLabel(studioProductOccasion)} and All occasions`;
  $('#pickerEmpty').textContent = !products.length ? 'Add products to the Product library first.' : `No products match the selected occasion, search, and budget${budgetHint}.`;
  $('#pickerHint').textContent = `Showing ${occasionHint}${budgetHint}. The combo occasion on the left is saved with the combo; it does not filter these products. Prices include the current product buffer. Choose up to 12 products. The visual collage shows up to six and clearly marks any additional items.`;
  $('#selectionLabel').textContent = `${selectedProducts.size} / ${MAX_COMBO_PRODUCTS} selected`;
  $('#productPicker').querySelectorAll('button').forEach(button => button.onclick = () => { const id = button.dataset.id; if (selectedProducts.has(id)) selectedProducts.delete(id); else if (selectedProducts.size < MAX_COMBO_PRODUCTS) selectedProducts.add(id); renderStudio(); });
}
function comboCost(productIds = [...selectedProducts]) { return productIds.reduce((total, id) => total + Number(products.find(product => product.id === id)?.rate || 0), 0); }
function liveComboRate(combo) { return Math.round(comboCost(combo.productIds) * (1 + Number(combo.margin ?? 30) / 100)); }
function comboMargin() { const margin = Number($('#marginRange').value); return [10, 15, 20, 25, 30, 35, 40, 45, 50].includes(margin) ? margin : 30; }
function comboDraft() { const cost = comboCost(), margin = comboMargin(); return { id: editingCombo || `combo-${uuid()}`, occasion: currentOccasion(), name: $('#comboName').value.trim(), cost, margin, rate: Math.round(cost * (1 + margin / 100)), productIds: [...selectedProducts] }; }
function collage(items, print = false) { const shown = items.slice(0, COMBO_COLLAGE_PRODUCTS); const remaining = Math.max(0, items.length - shown.length); const style = shown.length === 1 ? 'one' : shown.length === 2 ? 'two' : shown.length === 3 ? 'three' : shown.length === 4 ? 'four' : shown.length === 5 ? 'five' : 'six'; return `<div class="collage ${style} ${remaining ? 'has-overflow' : ''} ${print ? 'print-collage' : ''}">${shown.map((product, index) => imageMarkup(product, `collage-photo photo-${index}`)).join('')}${remaining ? `<span class="collage-more" aria-label="${remaining} more products">+${remaining}</span>` : ''}</div>`; }
function setStudioTab(tab) { studioTab = tab === 'manage' ? 'manage' : 'design'; document.querySelectorAll('[data-studio-tab]').forEach(button => { const active = button.dataset.studioTab === studioTab; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); }); $('#studioDesign').hidden = studioTab !== 'design'; $('#studioManage').hidden = studioTab !== 'manage'; $('#studioDesign').classList.toggle('active', studioTab === 'design'); $('#studioManage').classList.toggle('active', studioTab === 'manage'); renderSavedCombos(); }
function renderStudio() { renderPicker(); const draft = comboDraft(), items = draft.productIds.map(id => products.find(product => product.id === id)).filter(Boolean); $('#productCost').value = money(draft.cost); $('#marginRange').value = String(draft.margin); $('#comboRate').value = money(draft.rate); $('#inclusionList').innerHTML = items.length ? items.map(product => `<li>${escapeHtml(product.name)}</li>`).join('') : '<li>Select products to build your inclusion list.</li>'; renderSavedCombos(); }
function savedThumbs(items) { return collage(items).replace('class="collage ', 'class="saved-thumbs collage '); }
function renderSavedCombos() { const occasion = $('#manageComboOccasion').value || 'all_combos'; const visible = occasion === 'all_combos' ? combos : combos.filter(combo => normalizeTag(combo.occasion) === occasion); $('#comboCount').textContent = visible.length ? `${visible.length} saved` : 'No saved combos'; $('#comboList').innerHTML = visible.map(combo => { const items = combo.productIds.map(id => products.find(product => product.id === id)).filter(Boolean); return `<article class="saved-combo"><div class="saved-combo-images">${savedThumbs(items)}</div><div><p>${escapeHtml(tagLabel(normalizeTag(combo.occasion)))}</p><h3>${escapeHtml(combo.name)}</h3><span>${items.length} products · ${money(liveComboRate(combo))}</span></div><div class="card-actions"><button data-view-combo="${escapeHtml(combo.id)}">View</button><button data-edit="${escapeHtml(combo.id)}">Edit</button><button data-delete="${escapeHtml(combo.id)}">Delete</button></div></article>`; }).join('') || '<p class="muted">No saved combos match this filter.</p>'; document.querySelectorAll('[data-view-combo]').forEach(button => button.onclick = () => openComboDetail(button.dataset.viewCombo)); document.querySelectorAll('[data-edit]').forEach(button => button.onclick = () => loadCombo(button.dataset.edit)); document.querySelectorAll('[data-delete]').forEach(button => button.onclick = () => deleteCombo(button.dataset.delete)); }
function loadCombo(id) { const combo = combos.find(item => item.id === id); if (!combo) return; editingCombo = combo.id; selectedProducts = new Set(combo.productIds); $('#occasion').value = normalizeTag(combo.occasion); $('#comboName').value = combo.name; $('#marginRange').value = [10, 15, 20, 25, 30, 35, 40, 45, 50].includes(Number(combo.margin)) ? combo.margin : 30; setStudioTab('design'); renderStudio(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function clearCombo() { editingCombo = null; selectedProducts = new Set(); $('#comboName').value = ''; $('#marginRange').value = 30; renderStudio(); }
async function saveCombo() { if (!assertAccess()) return; const draft = comboDraft(); if (!draft.occasion || !draft.name || !draft.rate || !draft.productIds.length) return notify('Add an occasion, combo name, rate, and at least one product.'); const isEditing = Boolean(editingCombo); const saveButton = $('#saveCombo'); saveButton.disabled = true; saveButton.textContent = 'Saving…'; try { const { error } = await db.from('library_items').upsert({ id: draft.id, owner_id: user.id, kind: 'combo', name: draft.name, cost: draft.rate, contents: JSON.stringify({ margin: draft.margin, componentCost: draft.cost }), component_ids: draft.productIds, occasions: [draft.occasion], photo: '' }); if (error) return notify(error.message); editingCombo = draft.id; await hydrateFromSupabase(['items', 'orders']); notify(isEditing ? 'Combo updated' : 'Combo saved', 'success'); } finally { saveButton.disabled = false; saveButton.textContent = 'Save combo'; } }
async function deleteCombo(id) { if (!assertAccess() || !confirm('Delete this combo?')) return; const { error } = await db.from('library_items').delete().eq('id', id); if (error) return notify(error.message); if (editingCombo === id) clearCombo(); await hydrateFromSupabase(['items', 'orders']); }
function openComboDetail(id) { const combo = combos.find(item => item.id === id); if (!combo) return notify('This saved combo is no longer available.'); const items = combo.productIds.map(productId => products.find(product => product.id === productId)).filter(Boolean); $('#comboDetail').innerHTML = `<p class="section-label">SAVED COMBO</p><h2>${escapeHtml(combo.name)}</h2><p class="combo-detail-occasion">${escapeHtml(tagLabel(normalizeTag(combo.occasion)))}</p><div class="combo-detail-summary"><div><span>Product cost</span><b>${money(comboCost(combo.productIds))}</b></div><div><span>Margin</span><b>${Number(combo.margin || 0)}%</b></div><div><span>Final price</span><b>${money(liveComboRate(combo))}</b></div></div><section class="combo-detail-products"><p class="section-label">WHAT’S INCLUDED</p>${items.length ? `<div class="combo-detail-product-grid">${items.map(product => `<article><div>${imageMarkup(product, 'combo-detail-product-image')}</div><b>${escapeHtml(product.name)}</b><span>${money(product.rate)}</span></article>`).join('')}</div>` : '<p class="muted">The products in this saved combo are no longer available.</p>'}</section>`; $('#comboDetailDialog').showModal(); }
function productStockStatus(product) { if (product.stockOnHand <= 0) return 'Out of stock'; if (product.stockOnHand <= product.reorderLevel) return 'Low stock'; return 'In stock'; }
function openProductDetail(product) { if (!product) return notify('This product is no longer available.'); const stockStatus = productStockStatus(product); const units = count => `${count} unit${Number(count) === 1 ? '' : 's'}`; $('#productDetail').innerHTML = `<div class="product-detail-layout"><div class="product-detail-image">${imageMarkup(product, 'product-detail-photo')}</div><div class="product-detail-copy"><p class="section-label">PRODUCT DETAIL</p><h2>${escapeHtml(product.name)}</h2><p class="product-detail-sku">PRODUCT ID · ${escapeHtml(product.sku)}</p><div class="product-detail-price"><span>Final product price</span><strong>${money(product.rate)}</strong></div></div></div><div class="product-detail-grid"><div><span>Product cost</span><b>${money(product.baseCost)}</b></div><div><span>Buffer</span><b>${money(product.buffer)}</b></div><div><span>In inventory</span><b>${units(product.stockOnHand)}</b></div><div><span>Stock status</span><b class="product-stock-${stockStatus === 'In stock' ? 'good' : stockStatus === 'Low stock' ? 'low' : 'out'}">${stockStatus}</b></div><div><span>Reorder at</span><b>${units(product.reorderLevel)}</b></div><div><span>Supplier lead time</span><b>${product.leadTimeDays ? `${product.leadTimeDays} day${product.leadTimeDays === 1 ? '' : 's'}` : 'Not set'}</b></div></div><section class="product-detail-section"><span>Vendor</span><b>${escapeHtml(product.supplier || 'Not set')}</b></section><section class="product-detail-section"><span>Suitable occasions</span><p>${escapeHtml(product.events.map(tagLabel).join(' · '))}</p></section><p class="product-detail-added">${product.createdAt ? `Added ${escapeHtml(formattedDate(String(product.createdAt).slice(0, 10)))}` : 'Added date not available for this product.'}</p>`; $('#productDetailDialog').showModal(); }
function addOrderComboLink(order) { if (!order.comboId || !combos.some(combo => combo.id === order.comboId)) return; const section = $('#orderDetail .order-detail-section'); const name = section?.querySelector('b'); if (!name) return; const button = document.createElement('button'); button.type = 'button'; button.className = 'combo-detail-link'; button.textContent = order.comboName; const hint = document.createElement('span'); hint.textContent = 'View combo →'; button.append(hint); button.onclick = () => { $('#orderDetailDialog').close(); openComboDetail(order.comboId); }; name.replaceWith(button); }

function renderLibrary() { syncOccasionLists(); $('#librarySearch').value = librarySearch; $('#librarySort').value = librarySort; const query = librarySearch.trim().toLowerCase(); const visible = products.filter(product => (libraryEvent === 'all_products' || productMatchesEvent(product, libraryEvent)) && (!query || product.name.toLowerCase().includes(query))); const createdAt = product => new Date(product.createdAt || 0).getTime() || 0; visible.sort((first, second) => { if (librarySort === 'rate-asc') return first.rate - second.rate || first.name.localeCompare(second.name); if (librarySort === 'rate-desc') return second.rate - first.rate || first.name.localeCompare(second.name); if (librarySort === 'added-desc') return createdAt(second) - createdAt(first) || first.name.localeCompare(second.name); if (librarySort === 'added-asc') return createdAt(first) - createdAt(second) || first.name.localeCompare(second.name); return first.name.localeCompare(second.name); }); $('#libraryGrid').innerHTML = visible.map(product => `<article class="product-card"><button type="button" class="product-card-body" data-product-view="${product.id}" aria-label="View ${escapeHtml(product.name)} product details">${imageMarkup(product, 'product-photo')}<div><p>${escapeHtml(product.events.map(tagLabel).join(' · '))}</p><h3>${escapeHtml(product.name)}</h3><b>${product.rate ? money(product.rate) : 'Rate not set'}</b></div></button><div class="card-actions"><button data-product-view="${product.id}">View</button><button data-product-edit="${product.id}">Edit</button><button data-product-delete="${product.id}">Delete</button></div></article>`).join(''); $('#libraryEmpty').hidden = visible.length > 0; $('#libraryEmpty').textContent = products.length ? (query ? `No products match “${librarySearch.trim()}”.` : `No products are tagged for ${tagLabel(libraryEvent)}.`) : 'Your product library is empty. Add the first product to begin.'; document.querySelectorAll('[data-product-view]').forEach(button => button.onclick = () => openProductDetail(products.find(product => product.id === button.dataset.productView))); document.querySelectorAll('[data-product-edit]').forEach(button => button.onclick = () => openProductDialog(products.find(product => product.id === button.dataset.productEdit))); document.querySelectorAll('[data-product-delete]').forEach(button => button.onclick = () => deleteProduct(button.dataset.productDelete)); }
function openOccasionDialog() { if (!assertAccess()) return; renderOccasionManager(); $('#occasionDialog').showModal(); }
function renderOccasionManager() {
  const manager = $('#occasionManager');
  const replacementOptions = occasionTypes.filter(occasion => occasion.code !== 'all').map(occasion => `<option value="${escapeHtml(occasion.code)}">${escapeHtml(occasion.label)}</option>`).join('');
  manager.innerHTML = `<div class="occasion-manager-heading"><p class="section-label">PRODUCT LIBRARY SETUP</p><h2>Manage occasions</h2><p>Create the event choices your team needs. Product and combo tags stay intact when you rename an occasion.</p></div><form id="occasionCreateForm" class="occasion-create-form"><label>New occasion<input name="label" maxlength="80" required placeholder="e.g. House party"></label><button class="primary-btn" type="submit">Add occasion</button></form><section class="occasion-system-note"><b>All occasions</b><span>This is a system tag for products that genuinely suit every occasion, so it cannot be removed.</span></section><div class="occasion-manager-list">${occasionTypes.filter(occasion => occasion.code !== 'all').map(occasion => `<article class="occasion-manager-item"><label>Occasion name<input data-occasion-label="${escapeHtml(occasion.code)}" maxlength="80" value="${escapeHtml(occasion.label)}"></label><div class="occasion-manager-actions"><button class="soft-btn" type="button" data-occasion-save="${escapeHtml(occasion.code)}">Save name</button><label>Move tagged items to<select data-occasion-replacement="${escapeHtml(occasion.code)}"><option value="all">All occasions</option>${replacementOptions}</select></label><button class="text-btn danger-btn" type="button" data-occasion-delete="${escapeHtml(occasion.code)}">Remove</button></div></article>`).join('')}</div>`;
  $('#occasionCreateForm').onsubmit = async event => { event.preventDefault(); const label = event.currentTarget.elements.label.value.trim(); try { await createOccasion(label); event.currentTarget.reset(); } catch (error) { notify(error.message || 'Could not add occasion.'); } };
  document.querySelectorAll('[data-occasion-save]').forEach(button => button.onclick = async () => { const code = button.dataset.occasionSave; const label = document.querySelector(`[data-occasion-label="${CSS.escape(code)}"]`).value.trim(); try { await renameOccasion(code, label); } catch (error) { notify(error.message || 'Could not update occasion.'); } });
  document.querySelectorAll('[data-occasion-delete]').forEach(button => button.onclick = async () => { const code = button.dataset.occasionDelete; const select = document.querySelector(`[data-occasion-replacement="${CSS.escape(code)}"]`); const target = select.value; if (target === code) return notify('Choose a different replacement occasion before removing this one.'); if (!confirm(`Remove ${tagLabel(code)}? Existing product and combo tags will move to ${tagLabel(target)}.`)) return; try { await removeOccasion(code, target); } catch (error) { notify(error.message || 'Could not remove occasion.'); } });
}
async function createOccasion(label) { if (!label) throw new Error('Enter an occasion name.'); const { error } = await db.rpc('create_workspace_occasion', { p_label: label }); if (error) throw error; await hydrateFromSupabase(['occasions']); renderOccasionManager(); notify('Occasion added to the shared library.', 'success'); }
async function renameOccasion(code, label) { if (!label) throw new Error('Enter an occasion name.'); const { error } = await db.rpc('rename_workspace_occasion', { p_code: code, p_label: label }); if (error) throw error; await hydrateFromSupabase(['occasions']); renderOccasionManager(); notify('Occasion name updated everywhere.', 'success'); }
async function removeOccasion(code, replacementCode) { const { error } = await db.rpc('remove_workspace_occasion', { p_code: code, p_replacement_code: replacementCode }); if (error) throw error; await hydrateFromSupabase(['occasions', 'items', 'orders']); renderOccasionManager(); notify('Occasion removed and existing tags reassigned.', 'success'); }
function syncProductRoundedPrice() { const form = $('#productForm'); if (!form) return; $('#productRoundedPrice').value = money(roundedProductPrice(form.elements.rate.value, form.elements.buffer.value)); }
function syncProductBufferDefault() { const form = $('#productForm'); if (!form) return; if (form.dataset.bufferManuallyEdited !== 'true') { const cost = Math.max(0, Number(form.elements.rate.value || 0)); form.elements.buffer.value = cost ? (Math.round(cost * 8) / 100).toFixed(2) : ''; } syncProductRoundedPrice(); }
function openProductDialog(product) { if (!assertAccess()) return; editingProduct = product?.id || null; const form = $('#productForm'); form.reset(); form.dataset.draftProductId = product?.id || `product-${uuid()}`; form.dataset.bufferManuallyEdited = product ? 'true' : 'false'; $('#eventTagChoices').innerHTML = tableOccasions().map(tag => `<label><input type="checkbox" name="events" value="${tag}"${(product?.events || []).includes(tag) ? ' checked' : ''}>${tagLabel(tag)}</label>`).join(''); $('#dialogLabel').textContent = product ? 'EDIT PRODUCT' : 'NEW PRODUCT'; $('#dialogTitle').textContent = product ? 'Edit product' : 'Add a product'; if (product) { form.elements.name.value = product.name; form.elements.rate.value = product.baseCost || ''; form.elements.buffer.value = product.buffer || 0; form.elements.supplier.value = product.supplier || ''; form.elements.reorderLevel.value = product.reorderLevel || 0; form.elements.leadTimeDays.value = product.leadTimeDays || 0; } syncProductRoundedPrice(); $('#productDialog').showModal(); }
const preparedUploads = new WeakMap();
async function uploadImage(file) {
  let draft = preparedUploads.get(file);
  if (!draft) {
    draft = { variants: await ProductImages.prepare(file), version: uuid(), uploaded: new Set() };
    preparedUploads.set(file, draft);
  }
  for (const [variant, blob] of Object.entries(draft.variants)) {
    if (draft.uploaded.has(variant)) continue;
    const path = `${user.id}/variants-v1/${draft.version}/${variant}.webp`;
    const { error } = await db.storage.from('catalogue').upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
    if (error && String(error.statusCode) !== '409') throw error;
    // A lost success response may leave this exact immutable object already stored.
    draft.uploaded.add(variant);
  }
  return db.storage.from('catalogue').getPublicUrl(`${user.id}/variants-v1/${draft.version}/grid.webp`).data.publicUrl;
}
async function saveProduct(form) {
  if (!assertAccess() || productSaveInFlight) return;
  const existing = products.find(product => product.id === editingProduct);
  const events = [...form.querySelectorAll('[name="events"]:checked')].map(input => input.value);
  if (!events.length) throw new Error('Select at least one suitable occasion before saving the product.');
  const submitButton = form.querySelector('[type="submit"]');
  const buttonLabel = submitButton?.textContent || 'Save product';
  productSaveInFlight = true;
  if (submitButton) { submitButton.disabled = true; submitButton.classList.add('is-loading'); submitButton.setAttribute('aria-busy', 'true'); submitButton.textContent = 'Saving product…'; }
  try {
    await runDatabaseUpdate('Saving product…', async () => {
      const id = existing?.id || form.dataset.draftProductId;
      let image = existing?.image || '';
      const imageFile = form.elements.image.files[0];
      if (imageFile) image = await uploadImage(imageFile);
      const productCost = Math.max(0, Number(form.elements.rate.value || 0));
      const buffer = Math.max(0, Number(form.elements.buffer.value || 0));
      const payload = { id, owner_id: user.id, kind: 'product', name: form.elements.name.value.trim(), cost: productCost, buffer, occasions: events, photo: image, contents: '', component_ids: [], sku: existing?.sku || id, supplier_name: form.elements.supplier.value.trim(), reorder_level: Math.max(0, Number(form.elements.reorderLevel.value || 0)), lead_time_days: Math.max(0, Number(form.elements.leadTimeDays.value || 0)) };
      const { error } = await db.from('library_items').upsert(payload);
      if (error) throw error;
      if (payload.supplier_name) {
        const { error: vendorError } = await db.from('vendors').upsert({ owner_id: user.id, name: payload.supplier_name }, { onConflict: 'name', ignoreDuplicates: true });
        if (vendorError) throw vendorError;
      }
      $('#productDialog').close();
      await hydrateFromSupabase(['items', 'vendors', 'orders']);
      notify(imageFile ? 'Product and image saved to the shared catalogue.' : 'Product saved to the shared catalogue.', 'success');
    });
  } finally {
    productSaveInFlight = false;
    if (submitButton) { submitButton.disabled = false; submitButton.classList.remove('is-loading'); submitButton.removeAttribute('aria-busy'); submitButton.textContent = buttonLabel; }
  }
}
async function deleteProduct(id) {
  if (!assertAccess() || !confirm('Delete this product?')) return;
  const { error } = await db.rpc('delete_product_atomic', { p_product: id });
  if (error) return notify(error.message);
  await hydrateFromSupabase(['items', 'orders']);
}

function renderCatalogueChoices() { const occasion = $('#catalogueOccasion').value || 'all_combos'; const visible = occasion === 'all_combos' ? combos : combos.filter(combo => normalizeTag(combo.occasion) === occasion); $('#catalogueComboList').innerHTML = visible.map(combo => { const items = combo.productIds.map(id => products.find(product => product.id === id)).filter(Boolean); return `<label class="catalogue-choice"><input type="checkbox" value="${combo.id}" ${selectedExportCombos.has(combo.id) ? 'checked' : ''}><div>${collage(items)}<div><p>${escapeHtml(tagLabel(normalizeTag(combo.occasion)))}</p><h3>${escapeHtml(combo.name)}</h3><span>${items.length} products · ${money(liveComboRate(combo))} per combo</span></div></div></label>`; }).join(''); $('#catalogueEmpty').hidden = visible.length > 0; $('#catalogueEmpty').textContent = occasion === 'all_combos' ? 'No saved catalogues yet. Create a combo in Studio first.' : 'No saved catalogues match this occasion.'; document.querySelectorAll('.catalogue-choice input').forEach(input => input.onchange = () => { if (input.checked && !selectedExportCombos.has(input.value) && selectedExportCombos.size >= 6) { input.checked = false; return notify('A catalogue can include up to six combos.'); } input.checked ? selectedExportCombos.add(input.value) : selectedExportCombos.delete(input.value); }); }
function comboProducts(combo) { return combo.productIds.map(id => products.find(product => product.id === id)).filter(Boolean); }
function comboNeedsProductPage(combo) { return comboProducts(combo).length > COMBO_COLLAGE_PRODUCTS; }
function catalogueProductStrip(items, showAll = false) { const displayed = showAll ? items : items.slice(0, COMBO_COLLAGE_PRODUCTS); const remaining = Math.max(0, items.length - displayed.length); return `<div class="catalogue-product-strip product-count-${displayed.length}">${displayed.map((product, index) => `${index ? '<i aria-hidden="true">+</i>' : ''}<figure>${imageMarkup(product, 'catalogue-product-image')}</figure>`).join('')}${remaining ? `<figure class="catalogue-product-more" aria-label="${remaining} more products"><b>+${remaining}</b><span>MORE</span></figure>` : ''}</div>`; }
function catalogueSheetCard(combo, index = 0, expandedProducts = false) { const items = comboProducts(combo); return `<article class="catalogue-sheet-card${expandedProducts ? ' expanded-products' : ''}"><span class="catalogue-combo-number" aria-label="Combo ${index + 1}">${index + 1}</span><div class="catalogue-sheet-images">${catalogueProductStrip(items, expandedProducts)}</div><div class="catalogue-sheet-copy"><p>${escapeHtml(tagLabel(normalizeTag(combo.occasion)))}</p><h2>${escapeHtml(combo.name)}</h2><strong>${money(liveComboRate(combo))} <small>PER COMBO</small></strong><span>INCLUSIONS</span><ul class="${items.length > COMBO_COLLAGE_PRODUCTS ? 'many-inclusions' : ''}">${items.map(product => `<li>${escapeHtml(product.name)}</li>`).join('')}</ul></div></article>`; }
function catalogueWelcome() { const clientName = $('#catalogueClientName').value.trim(); return `Thank you${clientName ? `, ${clientName}` : ''}, for considering Meraki & Mirth. We would be truly delighted to add a little more joy to your celebration. We have curated these packages especially for you, with every detail chosen to make the moment feel even more special.`; }
function catalogueTelegramMessage(chosen, heading) { const clientName = $('#catalogueClientName').value.trim(); return `Meraki & Mirth — Catalogue shared\n\nClient: ${clientName || 'General catalogue'}\nCollection: ${heading}\nCombos included (${chosen.length}): ${chosen.map(combo => combo.name).join(' · ')}\nPrepared by: ${user?.email || 'Meraki & Mirth team'}`; }
async function dispatchTelegramNotifications() { if (!db || config?.disableNotifications) return; try { const { error } = await db.functions.invoke('telegram-notifications'); if (error) console.warn('Telegram notifications are queued and will retry shortly.', error.message); } catch (error) { console.warn('Telegram notifications are queued and will retry shortly.', error); } }
async function queueTelegramNotification(eventType, message) { if (!db || !user || config?.disableNotifications) return; const { error } = await db.from('operation_notifications').insert({ event_type: eventType, message }); if (error) { console.warn('Could not queue Telegram notification.', error.message); return; } void dispatchTelegramNotifications(); }
const isNativeApp = () => Boolean(window.Capacitor?.isNativePlatform?.());
const setExportPending = (button, pending, pendingText) => {
  if (!button.dataset.label) button.dataset.label = button.textContent.trim();
  button.disabled = pending;
  button.classList.toggle('is-loading', pending);
  button.setAttribute('aria-busy', String(pending));
  button.textContent = pending ? pendingText : button.dataset.label;
};
const pdfPalette = { ink: [24, 59, 52], gold: [171, 106, 43], paper: [252, 240, 228], line: [229, 215, 199], muted: [99, 89, 79] };
const pdfSafeText = value => String(value ?? '')
  .replaceAll('₹', 'INR ')
  .replaceAll('•', '-')
  .replaceAll('·', '-')
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-');
const pdfMoney = value => `INR ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(Number(value || 0)) ? 0 : 2, maximumFractionDigits: 2 })}`;
const pdfExportStamp = () => new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(new Date());
const pdfFilenamePart = value => String(value || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 56);
const pdfExportFilename = (type, ...details) => `Meraki & Mirth - ${type}${details.map(pdfFilenamePart).filter(Boolean).map(value => ` - ${value}`).join('')} - ${pdfExportStamp()}.pdf`;
async function printWithFilename(filename) {
  const images = [...document.querySelectorAll('#printCatalogue img')];
  const ready = await Promise.race([
    Promise.all(images.map(image => image.decode().then(() => true, () => false))),
    new Promise(resolve => setTimeout(() => resolve(null), 15000))
  ]);
  if (!ready || ready.includes(false)) { notify('Some print images could not load. Please retry the export.'); return; }
  const originalTitle = document.title; const title = filename.replace(/\.pdf$/i, ''); const restore = () => { document.title = originalTitle; window.removeEventListener('afterprint', restore); }; document.title = title; window.addEventListener('afterprint', restore, { once: true }); window.print(); window.setTimeout(restore, 5000); }
function blobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read image data.'));
    reader.readAsDataURL(blob);
  });
}
async function imageDataForPdf(source) {
  const resolvedSource = imageSource(source, 'export');
  if (!resolvedSource) return null;
  let dataUrl = resolvedSource.startsWith('data:') ? resolvedSource : '';
  if (!dataUrl) {
    // Rendering a fetched blob as a data URL keeps the canvas same-origin. It is
    // more reliable than blob URLs in Android's WebView and prevents letter-tile
    // fallbacks when a public Storage image decodes a little late.
    try {
      const response = await browserFetch(resolvedSource, { cache: 'force-cache', credentials: 'omit', signal: AbortSignal.timeout(15000) });
      if (!response.ok) return null;
      const blob = await response.blob();
      if (!blob.size) return null;
      dataUrl = await blobAsDataUrl(blob);
    } catch {
      // Leave a fallback tile on failure; avoid doubling egress with an automatic retry.
    }
  }
  if (!dataUrl) return null;
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const largestSide = Math.max(image.naturalWidth || 1, image.naturalHeight || 1);
        const size = Math.min(1200, largestSide);
        canvas.width = Math.round((image.naturalWidth || 1) / largestSide * size);
        canvas.height = Math.round((image.naturalHeight || 1) / largestSide * size);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', .9));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}
function pdfFrame(doc) { doc.setFillColor(...pdfPalette.paper); doc.rect(0, 0, 210, 297, 'F'); doc.setDrawColor(...pdfPalette.line); doc.setLineWidth(.45); doc.line(14, 282, 196, 282); doc.setTextColor(...pdfPalette.gold); doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text('MERAKI & MIRTH', 14, 288); doc.setFont('times', 'italic'); doc.setTextColor(...pdfPalette.muted); doc.text('For the moments worth thanking.', 47, 288); }
function pdfText(doc, text, x, y, width, { font = 'helvetica', style = 'normal', size = 10, color = pdfPalette.muted, line = 1.3 } = {}) { doc.setFont(font, style); doc.setFontSize(size); doc.setTextColor(...color); const lines = doc.splitTextToSize(pdfSafeText(text), width); doc.text(lines, x, y, { lineHeightFactor: line }); return y + lines.length * size * line * .3528; }
function pdfCenteredText(doc, text, x, y, { font = 'helvetica', style = 'normal', size = 8, color = pdfPalette.muted } = {}) { doc.setFont(font, style); doc.setFontSize(size); doc.setTextColor(...color); doc.text(pdfSafeText(text), x, y, { align: 'center', baseline: 'middle' }); }
const pdfTileCache = new Map();
async function pdfTileData(product) {
  const source = product?.image || '';
  if (!source) return null;
  if (pdfTileCache.has(source)) return pdfTileCache.get(source);
  const task = (async () => {
    const data = await imageDataForPdf(source);
    if (!data) return null;
    return new Promise(resolve => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const size = 420, radius = 34;
          canvas.width = size; canvas.height = size;
          const context = canvas.getContext('2d');
          // Leave the corners transparent. The PDF tile beneath supplies the
          // soft background, while this clipped PNG preserves the same rounded
          // image treatment on Android that the browser print sheet uses.
          context.beginPath();
          context.moveTo(radius, 0); context.arcTo(size, 0, size, size, radius); context.arcTo(size, size, 0, size, radius); context.arcTo(0, size, 0, 0, radius); context.arcTo(0, 0, size, 0, radius); context.closePath();
          context.clip();
          const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
          const drawWidth = image.naturalWidth * scale, drawHeight = image.naturalHeight * scale;
          context.drawImage(image, (size - drawWidth) / 2, (size - drawHeight) / 2, drawWidth, drawHeight);
          resolve(canvas.toDataURL('image/png'));
        } catch { resolve(null); }
      };
      image.onerror = () => resolve(null);
      image.src = data;
    });
  })();
  pdfTileCache.set(source, task);
  const value = await task;
  if (!value) pdfTileCache.delete(source);
  return value;
}
async function preloadPdfProductImages(items) {
  const uniqueItems = [...new Map(items.filter(Boolean).map(item => [item.image || item.id, item])).values()];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, uniqueItems.length) }, async () => { while (next < uniqueItems.length) await pdfTileData(uniqueItems[next++]); }));
}
async function pdfProductImage(doc, product, x, y, width, height) { const data = await pdfTileData(product); doc.setFillColor(247, 237, 225); doc.roundedRect(x, y, width, height, 2, 2, 'F'); if (data) { try { doc.addImage(data, 'PNG', x, y, width, height, undefined, 'FAST'); return; } catch {} } doc.setTextColor(...pdfPalette.gold); doc.setFont('times', 'bold'); doc.setFontSize(16); doc.text((product.name || 'M').slice(0, 1).toUpperCase(), x + width / 2, y + height / 2 + 4, { align: 'center' }); }
async function drawPdfProductGallery(doc, items, { centerX = 105, top, columns, tileSize, gap }) {
  const safeColumns = Math.max(1, columns || items.length || 1);
  const rows = Math.ceil(items.length / safeColumns);
  for (let index = 0; index < items.length; index += 1) {
    const row = Math.floor(index / safeColumns), rowStart = row * safeColumns;
    const itemsInRow = Math.min(safeColumns, items.length - rowStart);
    const rowWidth = itemsInRow * tileSize + Math.max(0, itemsInRow - 1) * gap;
    const x = centerX - rowWidth / 2 + (index - rowStart) * (tileSize + gap);
    const y = top + row * (tileSize + gap);
    await pdfProductImage(doc, items[index], x, y, tileSize, tileSize);
    if (index + 1 < rowStart + itemsInRow) pdfCenteredText(doc, '+', x + tileSize + gap / 2, y + tileSize / 2 + .5, { font: 'times', size: Math.max(11, tileSize * .65), color: pdfPalette.gold });
  }
  return rows * tileSize + Math.max(0, rows - 1) * gap;
}
async function shareNativePdf(doc, filename, title) { const filesystem = window.Capacitor?.Plugins?.Filesystem; const share = window.Capacitor?.Plugins?.Share; if (!filesystem || !share) throw new Error('PDF sharing is not available in this app build. Please update the Android app and try again.'); const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(doc.output('blob')); }); const file = await filesystem.writeFile({ path: filename, data, directory: 'CACHE', recursive: true }); await share.share({ title, text: `${title} — Meraki & Mirth`, url: file.uri, dialogTitle: 'Save or share your PDF' }); }
function cataloguePages(chosen) {
  const pages = [];
  let pairedPage = [];
  for (const combo of chosen) {
    if (comboNeedsProductPage(combo)) {
      if (pairedPage.length) pages.push(pairedPage);
      pairedPage = [];
      pages.push([combo]);
      continue;
    }
    pairedPage.push(combo);
    if (pairedPage.length === 2) {
      pages.push(pairedPage);
      pairedPage = [];
    }
  }
  if (pairedPage.length) pages.push(pairedPage);
  return pages;
}
async function drawNativeCataloguePage(doc, pageCombos, heading, totalCombos, pageNumber, pageCount, logo) {
  pdfFrame(doc);
  if (logo) doc.addImage(logo, 'JPEG', 14, 14, 24, 24, undefined, 'FAST');
  pdfText(doc, 'MERAKI & MIRTH', 43, 18, 115, { style: 'bold', size: 8, color: pdfPalette.gold });
  pdfText(doc, heading, 43, 27, 116, { font: 'times', style: 'bold', size: 19, color: pdfPalette.ink, line: 1.05 });
  const firstPage = pageNumber === 1;
  const message = firstPage ? catalogueWelcome() : `A closer look at the thoughtful sets curated especially for you. Page ${pageNumber} of ${pageCount}.`;
  const introEnd = pdfText(doc, message, 14, 46, 182, { font: 'times', style: 'italic', size: 9.5, color: pdfPalette.muted, line: 1.28 });
  doc.setFillColor(248, 237, 222);
  doc.roundedRect(163, 15, 33, 10, 5, 5, 'F');
  pdfCenteredText(doc, firstPage ? `${totalCombos} CURATED ${totalCombos === 1 ? 'COMBO' : 'COMBOS'}` : `PAGE ${pageNumber} OF ${pageCount}`, 179.5, 20.2, { style: 'bold', size: 6.2, color: pdfPalette.gold });
  const x = 14;
  const width = 182;
  const gap = 6;
  const y = Math.max(firstPage ? 69 : 62, introEnd + 7);
  const startIndex = pageCombos._offset || 0;
  const expandedPage = pageCombos.length === 1 && comboNeedsProductPage(pageCombos[0]);
  const cardHeight = expandedPage ? 198 : pageCombos.length === 1 ? 119 : 94;
  for (let index = 0; index < pageCombos.length; index += 1) {
    const combo = pageCombos[index];
    const items = comboProducts(combo);
    const cardY = y + index * (cardHeight + gap);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...pdfPalette.line);
    doc.roundedRect(x, cardY, width, cardHeight, 3, 3, 'FD');
    // Match the browser export: the number sits deliberately half outside the
    // card corner, instead of drifting inside the left whitespace.
    doc.setFillColor(...pdfPalette.ink);
    doc.setDrawColor(255, 249, 241);
    doc.setLineWidth(.55);
    doc.circle(x, cardY, 4.25, 'FD');
    pdfCenteredText(doc, String(startIndex + index + 1), x, cardY + .1, { style: 'bold', size: 6.6, color: [255, 255, 255] });
    const shownItems = expandedPage ? items : items.slice(0, COMBO_COLLAGE_PRODUCTS);
    const imageRows = expandedPage ? 2 : 1;
    const imageColumns = expandedPage ? Math.ceil(shownItems.length / imageRows) : shownItems.length;
    const imageSize = expandedPage ? 25 : 20;
    const imageGap = expandedPage ? 4 : 4;
    const galleryHeight = await drawPdfProductGallery(doc, shownItems, { centerX: x + width / 2, top: cardY + 9, columns: imageColumns, tileSize: imageSize, gap: imageGap });
    let textY = cardY + 14 + galleryHeight;
    textY = pdfText(doc, tagLabel(normalizeTag(combo.occasion)).toUpperCase(), x + 7, textY, width - 14, { style: 'bold', size: 6.4, color: pdfPalette.gold });
    textY = pdfText(doc, combo.name, x + 7, textY + 2, width - 14, { font: 'times', style: 'bold', size: expandedPage ? 16 : 13.5, color: pdfPalette.ink, line: 1.05 });
    textY = pdfText(doc, `${pdfMoney(liveComboRate(combo))} per curated set`, x + 7, textY + 3, width - 14, { style: 'bold', size: 8.2, color: pdfPalette.ink });
    pdfText(doc, 'INCLUSIONS', x + 7, textY + 5, width - 14, { style: 'bold', size: 6.2, color: pdfPalette.gold });
    const listTop = textY + 10, columns = expandedPage ? 3 : 2, rows = Math.ceil(items.length / columns), columnWidth = (width - 17) / columns;
    for (let column = 0; column < columns; column += 1) {
      let listY = listTop;
      for (const item of items.slice(column * rows, (column + 1) * rows)) listY = pdfText(doc, `- ${item.name}`, x + 8 + column * columnWidth, listY, columnWidth - 4, { size: expandedPage ? 6.9 : 6.4, color: pdfPalette.muted, line: 1.12 }) + .7;
    }
  }
}
async function exportCatalogueNative(chosen, heading, clientName = '', eventName = '') {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) throw new Error('The PDF tool is still loading. Please try again in a moment.');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pages = cataloguePages(chosen);
  pdfTileCache.clear();
  await preloadPdfProductImages(chosen.flatMap(comboProducts));
  const logo = await imageDataForPdf('assets/meraki-mirth-logo-original.png');
  for (let index = 0; index < pages.length; index += 1) {
    if (index) doc.addPage();
    pages[index]._offset = pages.slice(0, index).reduce((total, page) => total + page.length, 0);
    await drawNativeCataloguePage(doc, pages[index], heading, chosen.length, index + 1, pages.length, logo);
  }
  const filename = pdfExportFilename('Curated Catalogue', clientName, eventName || heading);
  await shareNativePdf(doc, filename, filename.replace(/\.pdf$/i, ''));
}
function catalogueSheetPage(pageCombos, heading, totalCombos, pageIndex, pageCount, offset) {
  const firstPage = pageIndex === 0;
  const welcome = firstPage ? catalogueWelcome() : `A closer look at the thoughtful sets curated especially for you. Page ${pageIndex + 1} of ${pageCount}.`;
  const marker = firstPage ? `${totalCombos} curated ${totalCombos === 1 ? 'combo' : 'combos'}` : `Page ${pageIndex + 1} of ${pageCount}`;
  const expandedProducts = pageCombos.length === 1 && comboNeedsProductPage(pageCombos[0]);
  return `<section class="print-catalogue-sheet"><header><img src="assets/meraki-mirth-logo-original.png" alt="Meraki &amp; Mirth"><div><p>MERAKI &amp; MIRTH</p><h1>${escapeHtml(heading)}</h1><em class="catalogue-welcome">${escapeHtml(welcome)}</em></div><b>${marker}</b></header><div class="catalogue-sheet-grid page-count-${pageCombos.length}${expandedProducts ? ' expanded-products-page' : ''}">${pageCombos.map((combo, index) => catalogueSheetCard(combo, offset + index, expandedProducts)).join('')}</div><footer><span>✿</span> MERAKI &amp; MIRTH <em>For the moments worth thanking.</em></footer></section>`;
}
async function exportCatalogue() {
  const chosen = combos.filter(combo => selectedExportCombos.has(combo.id));
  if (!chosen.length) return notify('Select at least one combo to export.');
  if (chosen.length > 6) return notify('A catalogue can include up to six combos.');
  const occasion = $('#catalogueOccasion').value.trim() || chosen[0].occasion;
  const eventName = occasion === 'all_combos' ? 'All occasions' : tagLabel(normalizeTag(occasion));
  const heading = occasion === 'all_combos' ? 'Curated Catalogue' : (/combos?$/i.test(occasion) ? occasion : `${eventName} Combos`);
  const clientName = $('#catalogueClientName').value.trim();
  if (isNativeApp()) {
    const button = $('#exportCatalogue');
    setExportPending(button, true, 'Preparing PDF…');
    try {
      await exportCatalogueNative(chosen, heading, clientName, eventName);
      // Temporarily paused while catalogue PDF testing is in progress.
      // await queueTelegramNotification('catalogue_shared', catalogueTelegramMessage(chosen, heading));
      notify('Your catalogue is ready to save or share.', 'success');
    } catch (error) {
      notify(error.message || 'Could not create the catalogue PDF.');
    } finally {
      setExportPending(button, false);
    }
    return;
  }
  const pages = cataloguePages(chosen);
  $('#printCatalogue').innerHTML = pages.map((pageCombos, pageIndex) => catalogueSheetPage(pageCombos, heading, chosen.length, pageIndex, pages.length, pages.slice(0, pageIndex).reduce((total, page) => total + page.length, 0))).join('');
  // Temporarily paused while catalogue PDF testing is in progress.
  // await queueTelegramNotification('catalogue_shared', catalogueTelegramMessage(chosen, heading));
  printWithFilename(pdfExportFilename('Curated Catalogue', clientName, eventName));
}

function selectedQuoteCombo() { return combos.find(combo => combo.id === $('#quoteCombo').value); }
function syncNetWrappingPrice() { const field = $('#quoteNetWrappingPriceField'), input = $('#quoteNetWrappingPrice'), grid = field?.parentElement; if (!field || !input) return; const enabled = $('#quoteNetWrapping').value === 'true'; field.hidden = !enabled; input.disabled = !enabled; if (!enabled) input.value = '0'; grid?.classList.toggle('has-net-wrapping-price', enabled); }
function quoteAdditionalCostValues() { return quoteAdditionalCosts.map(item => ({ id: item.id, label: String(item.label || '').trim() || 'Additional cost', amount: Math.max(0, Number(item.amount || 0)) })).filter(item => item.amount > 0); }
function renderQuoteAdditionalCosts() { const holder = $('#quoteAdditionalCosts'); if (!holder) return; holder.innerHTML = quoteAdditionalCosts.map(item => `<div class="quote-additional-cost-row" data-additional-cost="${escapeHtml(item.id)}"><label>Cost item<input data-additional-cost-label="${escapeHtml(item.id)}" maxlength="100" value="${escapeHtml(item.label || '')}" placeholder="e.g. Custom ribbon"></label><label>Amount (₹)<input data-additional-cost-amount="${escapeHtml(item.id)}" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(item.amount || '')}" placeholder="0"></label><button class="text-btn" type="button" data-remove-additional-cost="${escapeHtml(item.id)}">Remove</button></div>`).join(''); holder.querySelectorAll('[data-additional-cost-label]').forEach(input => input.oninput = () => { const item = quoteAdditionalCosts.find(cost => cost.id === input.dataset.additionalCostLabel); if (item) item.label = input.value; renderQuotePreview(); }); holder.querySelectorAll('[data-additional-cost-amount]').forEach(input => input.oninput = () => { const item = quoteAdditionalCosts.find(cost => cost.id === input.dataset.additionalCostAmount); if (item) item.amount = input.value; renderQuotePreview(); }); holder.querySelectorAll('[data-remove-additional-cost]').forEach(button => button.onclick = () => { quoteAdditionalCosts = quoteAdditionalCosts.filter(item => item.id !== button.dataset.removeAdditionalCost); renderQuoteAdditionalCosts(); renderQuotePreview(); }); }
function addQuoteAdditionalCost() { quoteAdditionalCosts.push({ id: uuid(), label: '', amount: '' }); renderQuoteAdditionalCosts(); $('#quoteAdditionalCosts [data-additional-cost-label]:last-of-type')?.focus(); }
function renderQuotes() { syncOccasionLists(); renderQuoteAdditionalCosts(); const select = $('#quoteCombo'), prior = select.value, occasion = $('#quoteOccasion').value || 'all_combos'; const visible = occasion === 'all_combos' ? combos : combos.filter(combo => normalizeTag(combo.occasion) === occasion); select.innerHTML = visible.map(combo => `<option value="${combo.id}">${escapeHtml(combo.name)} · ${escapeHtml(tagLabel(normalizeTag(combo.occasion)))}</option>`).join('') || '<option value="">No saved combos for this occasion</option>'; select.value = visible.some(combo => combo.id === prior) ? prior : visible[0]?.id || ''; renderQuotePreview(); }
function quoteDefaultTitle(combo, clientName) { const person = clientName.trim(); const possessive = person ? `${person}${/s$/i.test(person) ? '’' : '’s'}` : 'Your'; return `${possessive} ${tagLabel(normalizeTag(combo.occasion))} celebration`; }
function quoteValues() { const combo = selectedQuoteCombo(), quantity = Math.max(1, Number($('#quoteQuantity').value || 1)), margin = Number($('#quoteMargin').value || 30), clientName = $('#quoteClientName').value.trim(), clientMobile = $('#quoteClientMobile').value.replace(/\D/g, ''), deliveryArea = $('#quoteDeliveryArea').value.trim(), specialRequest = $('#quoteSpecialRequest').value.trim(), complimentary = $('#quoteComplimentary').value.trim(), eventDate = $('#quoteEventDate').value, deliveryDate = $('#quoteDeliveryDate').value, netWrapping = $('#quoteNetWrapping').value === 'true', netWrappingUnitPrice = netWrapping ? Math.max(0, Number($('#quoteNetWrappingPrice').value || 0)) : 0, additionalCosts = quoteAdditionalCostValues(), discountPercent = Math.min(100, Math.max(0, Number($('#quoteDiscountPercent').value || 0))); const netWrappingTotal = netWrappingUnitPrice * quantity, additionalCostTotal = additionalCosts.reduce((total, item) => total + item.amount, 0); if (!combo) return { quantity, margin, combo: null, cost: 0, price: 0, baseTotal: 0, netWrappingUnitPrice, netWrappingTotal, additionalCosts, additionalCostTotal, subtotal: 0, discountPercent, discountAmount: 0, total: 0, clientName, clientMobile, deliveryArea, specialRequest, complimentary, eventDate, deliveryDate, netWrapping, title: '' }; const cost = comboCost(combo.productIds), price = Math.round(cost * (1 + margin / 100)), baseTotal = price * quantity, subtotal = baseTotal + netWrappingTotal + additionalCostTotal, discountAmount = Math.round(subtotal * discountPercent) / 100, total = Math.max(0, subtotal - discountAmount); return { combo, quantity, margin, cost, price, baseTotal, netWrappingUnitPrice, netWrappingTotal, additionalCosts, additionalCostTotal, subtotal, discountPercent, discountAmount, total, clientName, clientMobile, deliveryArea, specialRequest, complimentary, eventDate, deliveryDate, netWrapping, title: $('#quoteTitle').value.trim() || quoteDefaultTitle(combo, clientName) }; }
function quoteThankYou(quote) { return `Thank you${quote.clientName ? `, ${quote.clientName}` : ''}, for considering Meraki & Mirth to be a part of your celebration. We are just as excited to make this moment feel special.`; }
function quoteSetItems(quote) { return quote.combo ? quote.combo.productIds.map(id => products.find(product => product.id === id)).filter(Boolean) : []; }
function quoteClientInclusions(quote) { const inclusions = quoteSetItems(quote).map(product => product.name); if (quote.netWrapping) inclusions.push('Net wrapping'); return inclusions; }
function formattedDate(value) { return value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }
function quoteDeliveryDetails(quote) { return [quote.deliveryDate ? `Delivery date: ${formattedDate(quote.deliveryDate)}` : '', quote.deliveryArea ? `Delivery area: ${quote.deliveryArea}` : ''].filter(Boolean); }
function renderQuotePreview() { const quote = quoteValues(), inclusions = quoteClientInclusions(quote), deliveryDetails = quoteDeliveryDetails(quote); $('#quotePreview').innerHTML = quote.combo ? `<p class="section-label">YOUR CELEBRATION QUOTE</p><h3>${escapeHtml(quote.title)}</h3><p class="quote-warm-note">${escapeHtml(quoteThankYou(quote))}</p><div class="quote-line"><span>Handpicked curated set</span><b>${escapeHtml(quote.combo.name)}</b></div><div class="quote-line"><span>Price per curated set</span><b>${money(quote.price)}</b></div><details class="quote-set-contents"><summary><span>What’s inside this curated set</span><span>View products</span></summary><ul>${inclusions.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details><div class="quote-line"><span>Curated sets</span><b>${quote.quantity}</b></div>${quote.eventDate ? `<div class="quote-line"><span>Event date</span><b>${escapeHtml(formattedDate(quote.eventDate))}</b></div>` : ''}${deliveryDetails.length ? `<div class="quote-line"><span>Delivery details</span><b>${escapeHtml(deliveryDetails.join(' · '))}</b></div>` : ''}${quote.discountAmount ? `<div class="quote-line discount"><span>${quote.discountPercent}% discount</span><b>− ${money(quote.discountAmount)}</b></div>` : ''}<div class="quote-line total"><span>Your celebration total</span><b>${money(quote.total)}</b></div>${quote.complimentary ? `<div class="quote-note"><span>Complimentary touches</span><p>${escapeHtml(quote.complimentary)}</p></div>` : ''}${quote.specialRequest ? `<div class="quote-request"><span>A little note from you</span><p>${escapeHtml(quote.specialRequest)}</p></div>` : ''}<p class="quote-signoff">With warmth,<br><b>Meraki &amp; Mirth</b><br><em>For the moments worth thanking.</em></p>` : '<p class="muted">Create a combo in Studio to prepare a quote.</p>'; }
function quoteWhatsappText(quote) { const inclusionList = quoteClientInclusions(quote).map(item => `• ${item}`).join('\n'), deliveryDetails = quoteDeliveryDetails(quote); return `✨ *${quote.title}* ✨\n\n${quoteThankYou(quote)}\n\n*Your thoughtfully curated set*\n${quote.combo.name}\n\n*What’s inside your curated set*\n${inclusionList}\n\n*Your quote at a glance*\n• ₹${quote.price.toLocaleString('en-IN')} per curated set\n• ${quote.quantity} curated sets${quote.eventDate ? `\n• *Event date: ${formattedDate(quote.eventDate)}*` : ''}${deliveryDetails.length ? `\n\n*Delivery details*\n${deliveryDetails.map(item => `• ${item}`).join('\n')}` : ''}${quote.discountAmount ? `\n• ${quote.discountPercent}% discount: −₹${quote.discountAmount.toLocaleString('en-IN')}` : ''}\n• *Celebration total: ₹${quote.total.toLocaleString('en-IN')}*${quote.complimentary ? `\n\n*Complimentary touches*\n${quote.complimentary}` : ''}${quote.specialRequest ? `\n\n*Your special request*\n${quote.specialRequest}` : ''}\n\nWe cannot wait to add a little more joy to your celebration. 🌼\n\nWith warmth,\n*Meraki & Mirth*\n_For the moments worth thanking._`; }
function copyQuote() { const quote = quoteValues(); if (!quote.combo) return; navigator.clipboard?.writeText(quoteWhatsappText(quote)); $('#copyQuote').textContent = 'WhatsApp message copied'; setTimeout(() => $('#copyQuote').textContent = 'Copy WhatsApp message', 1800); }
async function exportQuoteNative(quote) { return exportQuoteNativeEnhanced(quote); }
async function exportQuote() {
  const quote = quoteValues();
  if (!quote.combo) return notify('Choose a saved combo before downloading a quote.');
  if (isNativeApp()) {
    const button = $('#exportQuote'); setExportPending(button, true, 'Preparing PDF…');
    try { await exportQuoteNativeEnhanced(quote); notify('Your quote is ready to save or share.', 'success'); }
    catch (error) { notify(error.message || 'Could not create the quote PDF.'); }
    finally { setExportPending(button, false); }
    return;
  }
  const items = quoteSetItems(quote);
  const inclusions = quoteClientInclusions(quote);
  const productStrip = items.map((product, index) => `${index ? '<i aria-hidden="true">+</i>' : ''}<figure>${imageMarkup(product, 'print-quote-product-image')}</figure>`).join('');
  const eventDetails = quote.eventDate ? `Event date: ${formattedDate(quote.eventDate)}` : '', deliveryDetails = quoteDeliveryDetails(quote).join(' · ');
  const fulfilmentNote = 'Home pickup is always welcome. If you prefer delivery, we will gladly arrange it; Porter charges apply at actuals.';
  $('#printCatalogue').innerHTML = `<section class="print-catalogue-sheet print-quote-sheet"><header><img src="assets/meraki-mirth-logo-original.png" alt="Meraki &amp; Mirth"><div><p>YOUR CELEBRATION QUOTE</p><h1>${escapeHtml(quote.title)}</h1><span>Prepared with warmth by Meraki &amp; Mirth</span></div></header><div class="print-quote-body"><div class="print-quote-message"><p>${escapeHtml(quoteThankYou(quote))}</p><strong>${escapeHtml(quote.combo.name)}</strong><span>${escapeHtml(tagLabel(normalizeTag(quote.combo.occasion)))}</span>${eventDetails ? `<aside><b>Celebration schedule</b><p>${escapeHtml(eventDetails)}</p></aside>` : ''}${deliveryDetails ? `<aside><b>Delivery details</b><p>${escapeHtml(deliveryDetails)}</p></aside>` : ''}${quote.complimentary || quote.specialRequest ? `<aside><b>Thoughtful details</b><p>${quote.complimentary ? `${escapeHtml(quote.complimentary)} ` : ''}${quote.specialRequest ? `Client request: ${escapeHtml(quote.specialRequest)}` : ''}</p></aside>` : ''}</div><section class="print-quote-products${items.length > COMBO_COLLAGE_PRODUCTS ? ' expanded-products' : ''}"><span>YOUR THOUGHTFULLY CURATED SET</span><div>${productStrip}</div></section><section class="print-quote-inclusions"><span>WHAT’S INSIDE YOUR CURATED SET</span><ul class="${inclusions.length > COMBO_COLLAGE_PRODUCTS ? 'many-inclusions' : ''}">${inclusions.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section><div class="print-quote-total"><span>Price per curated set</span><b>${money(quote.price)}</b><span>Curated sets</span><b>${quote.quantity}</b>${quote.discountAmount ? `<span>${quote.discountPercent}% discount</span><b>− ${money(quote.discountAmount)}</b>` : ''}<strong>Celebration total <b>${money(quote.total)}</b></strong></div><p class="print-quote-fulfilment"><b>Collection &amp; delivery</b>${escapeHtml(fulfilmentNote)}</p></div><footer><span>✿</span> MERAKI &amp; MIRTH <em>For the moments worth thanking.</em></footer></section>`;
  printWithFilename(pdfExportFilename('Quote', quote.clientName, quote.title));
}
const pendingBusinessWrites = new Map();
async function writeOnce(kind, payload, execute) {
  const key = `meraki-pending-${user.id}-${kind}`;
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(kind === 'inventory' ? { ...payload, expected_stock: null } : payload))))).map(n => n.toString(16).padStart(2,'0')).join('');
  const prior = JSON.parse(sessionStorage.getItem(key) || 'null');
  if (prior && prior.fingerprint !== fingerprint) throw new Error('An earlier save has an uncertain outcome. Restore its original values and retry before starting a different save.');
  const operation = prior?.operation || uuid();
  if (kind === 'inventory' && prior) payload.expected_stock = prior.expectedStock;
  sessionStorage.setItem(key, JSON.stringify({ operation, fingerprint, expectedStock: payload.expected_stock }));
  if (pendingBusinessWrites.has(key)) return pendingBusinessWrites.get(key);
  const task = (async () => {
    const result = await execute(operation);
    if (result.error) {
      // SQL errors confirm rollback; transport failures retain the operation for retry.
      if (/^[0-9A-Z]{5}$/.test(result.error.code || '')) sessionStorage.removeItem(key);
      throw new Error(result.error.message);
    }
    sessionStorage.removeItem(key);
    return result.data;
  })();
  pendingBusinessWrites.set(key, task);
  try { return await task; } finally { pendingBusinessWrites.delete(key); }
}
async function refreshAfterCommit(groups) {
  try { await hydrateFromSupabase(groups); }
  catch (error) { notify(`Saved successfully, but the screen could not refresh: ${error.message}. Reload to see the saved result.`); }
}
async function saveOrder() { if (!assertAccess()) return; const quote = quoteValues(); if (!quote.combo) return notify('Choose a saved combo before saving a quotation.'); if (!quote.clientName) return notify('Add the client name before saving this quotation.'); if (!/^\d{7,15}$/.test(quote.clientMobile)) return notify('Add a valid client mobile number before saving this quotation.'); try {
 const client = { name: quote.clientName, mobile_number: quote.clientMobile, delivery_area: quote.deliveryArea };
 const order = { combo_id: quote.combo.id, title: quote.title, event: quote.combo.occasion, qty: quote.quantity, total: quote.total, status: 'Quotation sent', customer_name: quote.clientName, customer_phone: quote.clientMobile, delivery_area: quote.deliveryArea, special_request: quote.specialRequest, complimentary: quote.complimentary, event_date: quote.eventDate || null, delivery_date: quote.deliveryDate || null, net_wrapping: quote.netWrapping, net_wrapping_unit_price: quote.netWrappingUnitPrice, additional_costs: quote.additionalCosts, discount_percent: quote.discountPercent, discount_amount: quote.discountAmount, subtotal_before_discount: quote.subtotal, cost_snapshot: quote.cost * quote.quantity, items: [{ comboId: quote.combo.id, comboName: quote.combo.name, margin: quote.margin, pricePerCombo: quote.price, unitCost: quote.cost, clientMobile: quote.clientMobile, deliveryArea: quote.deliveryArea, eventDate: quote.eventDate, deliveryDate: quote.deliveryDate, netWrapping: quote.netWrapping, netWrappingUnitPrice: quote.netWrappingUnitPrice, netWrappingTotal: quote.netWrappingTotal, additionalCosts: quote.additionalCosts, additionalCostTotal: quote.additionalCostTotal, complimentary: quote.complimentary, discountPercent: quote.discountPercent, discountAmount: quote.discountAmount, subtotalBeforeDiscount: quote.subtotal }] };
 const data = await writeOnce('quotation', { client, order }, operation => db.rpc('save_quotation_once', { p_operation: operation, p_client: client, p_order: order }));
 void dispatchTelegramNotifications();
 notify('Quotation saved in the celebration workboard.', 'success');
 await refreshAfterCommit(['orders','clients']);
 await navigate('orders');
 if (data?.id) await openOrderDetail(data.id);
 } catch (error) { notify(error.message); }
}

async function exportQuoteNativeEnhanced(quote) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) throw new Error('The PDF tool is still loading. Please try again in a moment.');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const items = quoteSetItems(quote);
  const inclusions = quoteClientInclusions(quote);
  pdfTileCache.clear();
  await preloadPdfProductImages(items);
  pdfFrame(doc);
  const logo = await imageDataForPdf('assets/meraki-mirth-logo-original.png');
  if (logo) doc.addImage(logo, 'JPEG', 14, 14, 24, 24, undefined, 'FAST');
  pdfText(doc, 'YOUR CELEBRATION QUOTE', 43, 18, 145, { style: 'bold', size: 8, color: pdfPalette.gold });
  const headerEnd = pdfText(doc, quote.title, 43, 28, 150, { font: 'times', style: 'bold', size: 22, color: pdfPalette.ink, line: 1.03 });
  pdfText(doc, 'Prepared with warmth by Meraki & Mirth', 43, headerEnd + 2, 145, { font: 'times', style: 'italic', size: 10, color: pdfPalette.muted });
  doc.setDrawColor(...pdfPalette.line); doc.line(14, 51, 196, 51);
  let y = pdfText(doc, quoteThankYou(quote), 14, 64, 182, { font: 'times', style: 'italic', size: 11.5, color: pdfPalette.muted, line: 1.4 });
  y = pdfText(doc, quote.combo.name, 14, y + 5, 182, { font: 'times', style: 'bold', size: 19, color: pdfPalette.ink, line: 1.04 });
  pdfText(doc, tagLabel(normalizeTag(quote.combo.occasion)).toUpperCase(), 14, y + 2, 182, { style: 'bold', size: 7.5, color: pdfPalette.gold });
  const eventSchedule = quote.eventDate ? `Event: ${formattedDate(quote.eventDate)}` : '', deliveryDetails = quoteDeliveryDetails(quote);
  if (eventSchedule) pdfText(doc, eventSchedule, 14, y + 10, 182, { style: 'bold', size: 8, color: pdfPalette.gold });
  if (deliveryDetails.length) { const deliveryY = y + (eventSchedule ? 15 : 10); pdfText(doc, 'DELIVERY DETAILS', 14, deliveryY, 182, { style: 'bold', size: 7, color: pdfPalette.gold }); pdfText(doc, deliveryDetails.join('   |   '), 14, deliveryY + 4, 182, { size: 8, color: pdfPalette.muted }); }
  const cardTop = 99;
  const imageRows = items.length > COMBO_COLLAGE_PRODUCTS ? 2 : 1;
  const imageColumns = Math.ceil(items.length / imageRows);
  // Keep the smaller gallery centred, with generous breathing space around
  // each plus. Six to twelve products use two balanced rows instead of a
  // narrow, crowded strip.
  const imageSize = imageRows === 2 ? 20 : items.length > 5 ? 20 : 24;
  const imageGap = imageRows === 2 ? 6 : items.length > 5 ? 6 : 7;
  const productCardHeight = imageRows === 2 ? 66 : 44;
  doc.setFillColor(255, 255, 255); doc.setDrawColor(...pdfPalette.line); doc.roundedRect(14, cardTop, 182, productCardHeight, 3, 3, 'FD');
  pdfText(doc, 'YOUR THOUGHTFULLY CURATED SET', 20, cardTop + 9, 170, { style: 'bold', size: 7, color: pdfPalette.gold });
  for (let index = 0; index < items.length; index += 1) {
    const row = Math.floor(index / imageColumns);
    const rowStart = row * imageColumns;
    const itemsInRow = Math.min(imageColumns, items.length - rowStart);
    const rowWidth = itemsInRow * imageSize + Math.max(0, itemsInRow - 1) * imageGap;
    const x = 105 - rowWidth / 2 + (index - rowStart) * (imageSize + imageGap);
    const imageY = cardTop + 14 + row * (imageSize + imageGap);
    await pdfProductImage(doc, items[index], x, imageY, imageSize, imageSize);
    if (index < items.length - 1 && index + 1 < rowStart + itemsInRow) pdfCenteredText(doc, '+', x + imageSize + imageGap / 2, imageY + imageSize / 2 + 1, { font: 'times', size: 13, color: pdfPalette.gold });
  }
  const inclusionTop = cardTop + productCardHeight + 8;
  const inclusionHeight = items.length > COMBO_COLLAGE_PRODUCTS ? 38 : 45;
  doc.setFillColor(255, 255, 255); doc.setDrawColor(...pdfPalette.line); doc.roundedRect(14, inclusionTop, 182, inclusionHeight, 3, 3, 'FD');
  pdfText(doc, 'WHAT’S INSIDE YOUR CURATED SET', 20, inclusionTop + 9, 170, { style: 'bold', size: 7, color: pdfPalette.gold });
  const inclusionColumns = inclusions.length > 8 ? 3 : inclusions.length > 5 ? 2 : 1;
  const inclusionRows = Math.ceil(inclusions.length / inclusionColumns);
  const inclusionWidth = 166 / inclusionColumns;
  for (let column = 0; column < inclusionColumns; column += 1) { let listY = inclusionTop + 17; for (const item of inclusions.slice(column * inclusionRows, (column + 1) * inclusionRows)) listY = pdfText(doc, `-  ${item}`, 21 + column * inclusionWidth, listY, inclusionWidth - 5, { size: inclusions.length > 8 ? 6.4 : 7.5, color: pdfPalette.muted, line: 1.12 }) + .8; }
  const detailTop = inclusionTop + inclusionHeight + 9;
  const detailLines = [
    ['Price per curated set', pdfMoney(quote.price)],
    ['Curated sets', String(quote.quantity)],
    ...(quote.discountAmount ? [[`${quote.discountPercent}% discount`, `- ${pdfMoney(quote.discountAmount)}`]] : [])
  ];
  doc.setFillColor(252, 245, 235); doc.roundedRect(14, detailTop, 182, 57, 3, 3, 'F');
  detailLines.forEach(([label, value], index) => { const lineY = detailTop + 10 + index * 10; pdfText(doc, label, 21, lineY, 78, { size: 8.8, color: pdfPalette.muted }); pdfText(doc, value, 91, lineY, 35, { style: 'bold', size: 11, color: pdfPalette.ink }); });
  pdfText(doc, 'Celebration total', 132, detailTop + 19, 56, { style: 'bold', size: 9, color: pdfPalette.ink });
  pdfText(doc, pdfMoney(quote.total), 132, detailTop + 32, 58, { style: 'bold', size: 17, color: pdfPalette.ink });
  pdfText(doc, 'COLLECTION & DELIVERY', 21, detailTop + 42, 166, { style: 'bold', size: 6.2, color: pdfPalette.gold });
  pdfText(doc, 'Home pickup is always welcome. If you prefer delivery, we will gladly arrange it; Porter charges apply at actuals.', 21, detailTop + 46, 166, { size: 6.6, color: pdfPalette.muted, line: 1.12 });
  const notes = [quote.complimentary ? `Complimentary: ${quote.complimentary}` : '', quote.specialRequest ? `Request: ${quote.specialRequest}` : ''].filter(Boolean).join(' ');
  if (notes && detailTop < 210) pdfText(doc, notes, 14, detailTop + 62, 182, { size: 7.2, color: pdfPalette.muted, line: 1.15 });
  const filename = pdfExportFilename('Quote', quote.clientName, quote.title);
  await shareNativePdf(doc, filename, filename.replace(/\.pdf$/i, ''));
}
function orderDateKey(order) { return String(order.createdAt || '').slice(0, 10); }
function currentYearDateRange() { const now = new Date(); const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-'); return { from: `${now.getFullYear()}-01-01`, to: today }; }
function filteredOrders() { return orders.filter(order => (!ordersFrom || orderDateKey(order) >= ordersFrom) && (!ordersTo || orderDateKey(order) <= ordersTo)); }
function renderOrderDetail(order) { const stages = ['Quotation sent', 'Confirmed', 'Advance paid', 'Procurement', 'Packaging', 'Ready for dispatch', 'Delivered', 'Full amount paid']; const isException = ['Lost', 'Dropped'].includes(order.status); const currentIndex = isException ? -1 : Math.max(0, stages.indexOf(order.status)); const progress = `${stages.map((stage, index) => `<span class="${index <= currentIndex ? 'complete' : ''}">${escapeHtml(stage)}</span>`).join('')}${isException ? `<span class="exception">${escapeHtml(order.status)}</span>` : ''}`; const profitText = order.profitRealised ? money(order.profit) : 'Pending final payment'; const card = order.thankYouCardStyle === 'none' ? '' : `${order.thankYouCardStyle === 'customized' ? 'Customized' : 'General'} thank-you card${order.thankYouCardUnitPrice ? ` · ${money(order.thankYouCardUnitPrice)} each` : ''}${order.thankYouCardDesignFee ? ` + ${money(order.thankYouCardDesignFee)} design` : ''}`; const wrapping = order.netWrapping ? `Net wrapping${order.netWrappingUnitPrice ? ` · ${money(order.netWrappingUnitPrice)} per curated set · ${money(order.netWrappingUnitPrice * order.quantity)} total` : ' included'}` : ''; $('#orderDetail').innerHTML = `<p class="section-label">CELEBRATION DETAIL</p><h2>${escapeHtml(order.title)}</h2><p class="order-detail-client">${escapeHtml(order.customerName || 'Client name not added')}${order.customerPhone ? ` · ${escapeHtml(order.customerPhone)}` : ''} · ${escapeHtml(tagLabel(normalizeTag(order.occasion)))}</p><div class="order-progress">${progress}</div><div class="order-detail-grid"><div><span>Quotation</span><b>${escapeHtml(order.code)}</b></div><div><span>Current status</span><b>${escapeHtml(order.status)}</b></div><div><span>Quote total</span><b>${money(order.total)}</b></div><div><span>Realised profit</span><b>${profitText}</b></div><div><span>Event date</span><b>${order.eventDate ? escapeHtml(formattedDate(order.eventDate)) : 'Not set'}</b></div><div><span>Delivery date</span><b>${order.deliveryDate ? escapeHtml(formattedDate(order.deliveryDate)) : 'Not set'}</b></div>${order.deliveryArea ? `<div><span>Delivery area</span><b>${escapeHtml(order.deliveryArea)}</b></div>` : ''}</div><section class="order-detail-section"><span>Chosen combo</span><b>${escapeHtml(order.comboName)}</b><small>${order.quantity} curated sets · Quote sent ${order.quoteSentAt ? new Date(order.quoteSentAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : order.created}</small></section>${wrapping || card || order.discountAmount ? `<section class="order-detail-section"><span>Quote add-ons</span><ul class="quote-addons-list">${wrapping ? `<li>${escapeHtml(wrapping)}</li>` : ''}${card ? `<li>${escapeHtml(card)}</li>` : ''}${order.discountAmount ? `<li>${order.discountPercent}% discount · − ${money(order.discountAmount)}</li>` : ''}</ul></section>` : ''}${order.complimentary ? `<section class="order-detail-section special"><span>Complimentary touches</span><p>${escapeHtml(order.complimentary)}</p></section>` : ''}${order.specialRequest ? `<section class="order-detail-section special"><span>Client’s special request</span><p>${escapeHtml(order.specialRequest)}</p></section>` : ''}<div class="order-detail-fields"><label>Delivery date<input data-order-delivery-date="${order.id}" type="date" value="${escapeHtml(order.deliveryDate || '')}"></label><label>Update progress<select data-order-detail-status="${order.id}">${orderStatuses.map(status => `<option${status === order.status ? ' selected' : ''}>${status}</option>`).join('')}</select></label></div>`; const statusSelect = $('[data-order-detail-status]'); if (statusSelect) statusSelect.onchange = () => updateOrderStatus(order.id, statusSelect.value); const deliveryDateInput = $('[data-order-delivery-date]'); if (deliveryDateInput) deliveryDateInput.onchange = () => updateOrderDeliveryDate(order.id, deliveryDateInput.value); }
const baseRenderOrderDetail = renderOrderDetail;
function addOrderInternalCosts(order) { if (!order.additionalCosts?.length) return; const fields = $('#orderDetail .order-detail-fields'); if (!fields) return; const section = document.createElement('section'); section.className = 'order-detail-section'; section.innerHTML = `<span>Internal cost adjustments</span><small>Team-only — not shown in the client quote.</small><ul class="quote-addons-list">${order.additionalCosts.map(item => `<li>${escapeHtml(item.label)} · ${money(item.amount)}</li>`).join('')}</ul>`; fields.before(section); }
renderOrderDetail = function renderOrderDetailWithComboLink(order) { baseRenderOrderDetail(order); addOrderComboLink(order); addOrderInternalCosts(order); };
async function openOrderDetail(id) { let order = orders.find(item => item.id === id); if (!order) { const epoch = dataEpoch; const result = await orderBaseQuery().eq('id',id).single(); if (epoch !== dataEpoch || !accessGranted) return; if (result.error) return notify('Could not load order details.'); order = orderFromRow(result.data); } openOrderId = id; renderOrderDetail(order); $('#orderDetailDialog').showModal(); }
function renderOrders() { const currentYear = currentYearDateRange(); $('#ordersFrom').value = ordersFrom; $('#ordersTo').value = ordersTo; const thisYearActive = ordersFrom === currentYear.from && ordersTo === currentYear.to; $('#ordersThisYear').textContent = thisYearActive ? 'This year · active' : 'This year'; $('#ordersThisYear').setAttribute('aria-pressed', String(thisYearActive)); const visible = filteredOrders(); $('#ordersCount').textContent = orderSummary.count; $('#ordersPacking').textContent = orderSummary.packing; $('#ordersDelivered').textContent = orderSummary.delivered; $('#ordersConversion').textContent = orderSummary.qualifying ? `${Math.round(orderSummary.converted / orderSummary.qualifying * 100)}%` : '0%'; $('#ordersProfit').textContent = money(orderSummary.profit); $('#ordersList').innerHTML = visible.map(order => `<article class="order-row"><div><p>${escapeHtml(order.status)}</p><h3>${escapeHtml(order.title)}</h3><span>${escapeHtml(order.customerName || order.comboName)} · ${escapeHtml(order.code)} · ${escapeHtml(order.created)}</span></div><div><span>Quote total</span><b>${money(order.total)}</b></div><div><span>Realised profit</span><b>${order.profitRealised ? money(order.profit) : 'Pending'}</b></div><div class="order-actions"><span>${order.quantity} curated sets${order.eventDate ? ` · Event ${escapeHtml(formattedDate(order.eventDate))}` : ''}${order.deliveryDate ? ` · Delivery ${escapeHtml(formattedDate(order.deliveryDate))}` : ''}</span><button data-order-view="${order.id}" class="soft-btn">View details</button></div></article>`).join(''); let more = $('#ordersLoadMore'); if (!more) { more = document.createElement('button'); more.id = 'ordersLoadMore'; more.className = 'soft-btn'; more.onclick = loadMoreOrders; $('#ordersList').after(more); } more.hidden = !orderHasMore; more.disabled = orderPageLoading; more.textContent = orderPageLoading ? 'Loading…' : 'Load more orders'; $('#ordersEmpty').hidden = visible.length > 0; document.querySelectorAll('[data-order-view]').forEach(button => button.onclick = () => openOrderDetail(button.dataset.orderView)); if (openOrderId && $('#orderDetailDialog').open) { const openOrder = orders.find(order => order.id === openOrderId); if (openOrder) renderOrderDetail(openOrder); } }
async function updateOrderStatus(id, status) { const { error } = await db.from('orders').update({ status }).eq('id', id); if (error) return notify(error.message); void dispatchTelegramNotifications(); await hydrateFromSupabase(['orders', 'items', 'clients']); }
async function updateOrderDeliveryDate(id, deliveryDate) { const { error } = await db.from('orders').update({ delivery_date: deliveryDate || null }).eq('id', id); if (error) return notify(error.message); await hydrateFromSupabase(['orders']); }
async function deleteOrder(id) { if (!confirm('Remove this order?')) return; const { error } = await db.from('orders').delete().eq('id', id); if (error) return notify(error.message); await hydrateFromSupabase(['orders', 'items', 'clients']); }

function inventoryHealth(product) { if (product.stockOnHand <= 0) return { key: 'out', label: 'Out of stock' }; if (product.reorderLevel > 0 && product.stockOnHand <= product.reorderLevel) return { key: 'low', label: 'Low stock' }; return { key: 'in', label: 'In stock' }; }
function renderInventory() {
  const query = inventorySearch.trim().toLowerCase();
  const matching = products.filter(product => {
    const health = inventoryHealth(product);
    return (!query || product.name.toLowerCase().includes(query) || product.id.toLowerCase().includes(query)) && (inventoryStatus === 'all' || health.key === inventoryStatus);
  });
  const totalPages = Math.max(1, Math.ceil(matching.length / inventoryPageSize));
  inventoryPage = Math.min(Math.max(1, inventoryPage), totalPages);
  const start = (inventoryPage - 1) * inventoryPageSize;
  const visible = matching.slice(start, start + inventoryPageSize);
  const lowCount = products.filter(product => inventoryHealth(product).key === 'low').length;
  const outCount = products.filter(product => inventoryHealth(product).key === 'out').length;
  $('#inventoryProductCount').textContent = products.length;
  $('#inventoryUnitsOnHand').textContent = products.reduce((total, product) => total + product.stockOnHand, 0).toLocaleString('en-IN');
  $('#inventoryLowStock').textContent = lowCount;
  $('#inventoryOutOfStock').textContent = outCount;
  $('#inventorySearch').value = inventorySearch;
  $('#inventoryStatus').value = inventoryStatus;
  $('#inventoryTable').innerHTML = visible.map(product => { const health = inventoryHealth(product); return `<tr><td><b>${escapeHtml(product.name)}</b><span>${escapeHtml(product.note || 'Uncategorised')}${product.supplier ? ` · ${escapeHtml(product.supplier)}` : ''}</span></td><td><code>${escapeHtml(product.sku || product.id)}</code></td><td><strong>${product.stockOnHand}</strong></td><td>${product.reorderLevel || '—'}</td><td><span class="stock-status ${health.key}">${health.label}</span></td><td><button class="soft-btn stock-button" data-stock-product="${product.id}">Update stock</button></td></tr>`; }).join('');
  $('#inventoryEmpty').hidden = matching.length > 0;
  $('#inventoryPagination').innerHTML = matching.length > inventoryPageSize ? `<span>${start + 1}–${Math.min(start + inventoryPageSize, matching.length)} of ${matching.length} products</span><div><button class="soft-btn" data-inventory-page="previous" ${inventoryPage === 1 ? 'disabled' : ''}>Previous</button><span>Page ${inventoryPage} of ${totalPages}</span><button class="soft-btn" data-inventory-page="next" ${inventoryPage === totalPages ? 'disabled' : ''}>Next</button></div>` : matching.length ? `<span>${matching.length} product${matching.length === 1 ? '' : 's'}</span>` : '';
  document.querySelectorAll('[data-stock-product]').forEach(button => button.onclick = () => openInventoryDialog(products.find(product => product.id === button.dataset.stockProduct)));
  document.querySelectorAll('[data-inventory-page]').forEach(button => button.onclick = () => { inventoryPage += button.dataset.inventoryPage === 'next' ? 1 : -1; renderInventory(); });
}
function inventoryDialogProduct() { return products.find(product => product.id === $('#inventoryProduct').value); }
function syncInventoryDialog(resetReorderLevel = false) {
  const form = $('#inventoryForm'); const product = inventoryDialogProduct(); const action = form.elements.action.value;
  $('#inventoryCurrentStock').textContent = `${product?.stockOnHand || 0} units`;
  if (resetReorderLevel) form.elements.reorderLevel.value = product?.reorderLevel || 0;
  const label = action === 'set' ? 'Set current stock' : action === 'damage' ? 'Units written off' : action === 'adjustment' ? 'Adjustment (use − to reduce)' : 'Units received';
  $('#inventoryQuantityLabel').firstChild.textContent = label;
  form.elements.quantity.min = action === 'adjustment' ? '' : action === 'set' ? '0' : '1';
  form.elements.quantity.placeholder = action === 'adjustment' ? 'e.g. -2 or 6' : '';
}
function openInventoryDialog(product) {
  if (!assertAccess()) return;
  const form = $('#inventoryForm'); form.reset();
  $('#inventoryProduct').innerHTML = products.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} (${escapeHtml(item.sku || item.id)})</option>`).join('');
  $('#inventoryProduct').value = product?.id || products[0]?.id || '';
  form.elements.action.value = 'receive';
  syncInventoryDialog(true);
  $('#inventoryDialog').showModal();
}
async function saveInventory(form) {
  if (!assertAccess()) return;
  const product = inventoryDialogProduct();
  if (!product) throw new Error('Choose a product first.');
  const action = form.elements.action.value;
  const quantity = Number(form.elements.quantity.value);
  if (!Number.isInteger(quantity)) throw new Error('Enter a whole number of units.');
  const request = { product_id: product.id, action, quantity, expected_stock: action === 'set' ? product.stockOnHand : null, reorder_level: Math.max(0, Number(form.elements.reorderLevel.value || 0)), note: form.elements.note.value.trim() };
  await writeOnce('inventory', request, operation => db.rpc('record_inventory_once', { p_operation: operation, p_request: request }));
  $('#inventoryDialog').close();
  await refreshAfterCommit(['items']);
}

function expensePolicy(mode) { return expensePolicies.find(policy => policy.delivery_mode === mode); }
function expenseStatusLabel(claim) { return claim.approval_status === 'rejected' ? 'Rejected' : claim.settled_at ? 'Settled' : claim.approval_status === 'approved' ? 'Approved · to settle' : 'Pending approval'; }
function expenseDate(value) { return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
function currentExpenseAdmin() { return expenseAdmins.find(admin => admin.email === user?.email); }
function canReviewExpense(claim) { return Boolean(currentExpenseAdmin()?.can_approve_expenses) && claim.submitted_by_id !== user?.id && claim.approval_status === 'pending'; }
function expenseDetail(claim) {
  if (claim.expense_type === 'purchase') return `Purchase${claim.vendor ? ` · ${claim.vendor}` : ''}`;
  if (claim.delivery_mode === 'third_party') return `Delivery · ${claim.delivery_provider || 'Third-party service'}`;
  return `Delivery · ${claim.delivery_mode === 'bike' ? 'Bike' : 'Car'} · ${Number(claim.distance_km || 0).toLocaleString('en-IN')} km @ ${money(claim.rate_per_km)}/km`;
}
function renderExpenses() {
  $('#expensePendingTotal').textContent = money(expenseSummary.pending);
  $('#expenseApprovedTotal').textContent = money(expenseSummary.approved);
  $('#expenseSettledTotal').textContent = money(expenseSummary.settled);
  $('#expenseBalanceCards').innerHTML = expenseAdmins.map(admin => {
    const balance = expenseSummary.people.find(person => person.name === admin.display_name) || { approved: 0, pending: 0 };
    return `<article class="expense-balance-card"><div><span>${escapeHtml(admin.display_name)}</span>${admin.can_approve_expenses ? '<em>Approver</em>' : ''}</div><b>${money(balance.approved)}</b><small>To settle · ${money(balance.pending)} awaiting approval</small></article>`;
  }).join('');
  $('#expenseClaimCount').textContent = expenseSummary.count ? `Showing ${expenseClaims.length} of ${expenseSummary.count} claims` : '';
  $('#expenseList').innerHTML = expenseClaims.map(claim => `<article class="expense-row"><div class="expense-row-main"><p>${escapeHtml(claim.submitted_by_name)} · ${escapeHtml(expenseDate(claim.created_at))}</p><h3>${escapeHtml(claim.description)}</h3><span>${escapeHtml(expenseDetail(claim))}${claim.note ? ` · ${escapeHtml(claim.note)}` : ''}</span></div><b>${money(claim.amount)}</b><span class="expense-status ${escapeHtml(claim.approval_status)}${claim.settled_at ? ' settled' : ''}">${escapeHtml(expenseStatusLabel(claim))}</span><div class="expense-actions">${canReviewExpense(claim) ? `<button class="soft-btn" data-expense-review="approved" data-expense-id="${claim.id}">Approve</button><button class="text-btn" data-expense-review="rejected" data-expense-id="${claim.id}">Reject</button>` : ''}${currentExpenseAdmin()?.can_approve_expenses && claim.approval_status === 'approved' && !claim.settled_at ? `<button class="soft-btn" data-expense-settle="${claim.id}">Mark settled</button>` : ''}${claim.approved_by_name ? `<small>Reviewed by ${escapeHtml(claim.approved_by_name)}</small>` : ''}</div></article>`).join('');
  let more = $('#expenseLoadMore');
  if (!more) { more = document.createElement('button'); more.id = 'expenseLoadMore'; more.className = 'soft-btn'; more.onclick = loadMoreExpenses; $('#expenseList').after(more); }
  more.hidden = !expenseHasMore; more.disabled = expensePageLoading; more.textContent = expensePageLoading ? 'Loading…' : 'Load more expenses';
  $('#expenseEmpty').hidden = expenseClaims.length > 0;
  document.querySelectorAll('[data-expense-review]').forEach(button => button.onclick = () => reviewExpense(button.dataset.expenseId, button.dataset.expenseReview));
  document.querySelectorAll('[data-expense-settle]').forEach(button => button.onclick = () => settleExpense(button.dataset.expenseSettle));
}
function syncExpenseDialog() {
  const form = $('#expenseForm'); const isDelivery = form.elements.expenseType.value === 'delivery'; const deliveryMode = form.elements.deliveryMode.value;
  $('#deliveryExpenseFields').hidden = !isDelivery;
  $('#purchaseAmountField').hidden = isDelivery;
  $('#mileageFields').hidden = !isDelivery || deliveryMode === 'third_party';
  $('#thirdPartyFields').hidden = !isDelivery || deliveryMode !== 'third_party';
  form.elements.purchaseAmount.required = !isDelivery;
  form.elements.distanceKm.required = isDelivery && deliveryMode !== 'third_party';
  form.elements.thirdPartyAmount.required = isDelivery && deliveryMode === 'third_party';
  const policy = expensePolicy(deliveryMode); const kilometres = Number(form.elements.distanceKm.value || 0);
  const rate = policy ? Number(policy.fuel_price_per_litre) / Number(policy.kilometres_per_litre) : 0;
  $('#travelRateLabel').textContent = policy ? `${deliveryMode === 'bike' ? 'Bike' : 'Car'}: ₹${rate.toFixed(2)}/km · fuel ₹${Number(policy.fuel_price_per_litre).toLocaleString('en-IN')}/L ÷ ${Number(policy.kilometres_per_litre).toLocaleString('en-IN')} km/L` : 'Mileage rate unavailable';
  $('#travelAmountPreview').textContent = money(kilometres * rate);
}
function openExpenseDialog() {
  if (!assertAccess()) return;
  const form = $('#expenseForm'); form.reset(); form.elements.expenseType.value = 'purchase'; form.elements.deliveryMode.value = 'bike';
  syncExpenseDialog(); $('#expenseDialog').showModal();
}
async function saveExpense(form) {
  if (!assertAccess()) return;
  const expenseType = form.elements.expenseType.value;
  const deliveryMode = expenseType === 'delivery' ? form.elements.deliveryMode.value : null;
  const amount = expenseType === 'purchase' ? Number(form.elements.purchaseAmount.value) : deliveryMode === 'third_party' ? Number(form.elements.thirdPartyAmount.value) : null;
  const distance = expenseType === 'delivery' && deliveryMode !== 'third_party' ? Number(form.elements.distanceKm.value) : null;
  const { error } = await db.rpc('submit_expense_claim', { p_expense_type: expenseType, p_description: form.elements.description.value.trim(), p_vendor: form.elements.vendor.value.trim(), p_delivery_mode: deliveryMode, p_delivery_provider: deliveryMode === 'third_party' ? form.elements.deliveryProvider.value : '', p_distance_km: distance, p_amount: amount, p_note: form.elements.note.value.trim() });
  if (error) throw error;
  $('#expenseDialog').close(); await hydrateFromSupabase(['expenses']); notify('Expense submitted for independent approval.', 'success');
}
async function reviewExpense(id, action) {
  if (action === 'rejected' && !confirm('Reject this expense claim?')) return;
  const { error } = await db.rpc('review_expense_claim', { p_claim_id: id, p_action: action, p_note: '' });
  if (error) return notify(error.message); await hydrateFromSupabase(['expenses']);
}
async function settleExpense(id) {
  if (!confirm('Mark this approved expense as settled?')) return;
  const { error } = await db.rpc('settle_expense_claim', { p_claim_id: id, p_note: '' });
  if (error) return notify(error.message); await hydrateFromSupabase(['expenses']);
}

function renderAll() { renderStudio(); renderLibrary(); renderCatalogueChoices(); renderQuotes(); renderContacts(); renderInventory(); renderExpenses(); renderOrders(); }

document.querySelectorAll('.nav').forEach(button => button.onclick = () => navigate(button.dataset.view)); document.querySelectorAll('[data-studio-tab]').forEach(button => button.onclick = () => setStudioTab(button.dataset.studioTab));
if (isNativeApp()) { $('#exportCatalogue').textContent = 'Save / share catalogue PDF'; $('#exportQuote').textContent = 'Save / share quote PDF'; }
$('#addProduct').onclick = () => openProductDialog(); $('#manageOccasions').onclick = openOccasionDialog; $('#inventoryAddProduct').onclick = () => { navigate('library'); openProductDialog(); }; $('#addExpense').onclick = openExpenseDialog; $('#addClient').onclick = openClientDialog; $('#addVendor').onclick = () => openVendorDialog(); $('#closeDialog').onclick = () => $('#productDialog').close(); $('#closeOccasionDialog').onclick = () => $('#occasionDialog').close(); $('#closeInventoryDialog').onclick = () => $('#inventoryDialog').close(); $('#closeExpenseDialog').onclick = () => $('#expenseDialog').close(); $('#closeClientDialog').onclick = () => $('#clientDialog').close(); $('#closeVendorDialog').onclick = () => $('#vendorDialog').close(); $('#closeOrderDetailDialog').onclick = () => $('#orderDetailDialog').close(); $('#closeComboDetailDialog').onclick = () => $('#comboDetailDialog').close(); $('#closeProductDetailDialog').onclick = () => $('#productDetailDialog').close();
$('#comboName').addEventListener('input', renderStudio); $('#marginRange').addEventListener('change', renderStudio); $('#occasion').addEventListener('change', renderStudio); $('#manageComboOccasion').addEventListener('change', renderSavedCombos); $('#studioProductSearch').addEventListener('input', event => { studioProductSearch = event.target.value; renderPicker(); }); $('#studioProductOccasion').addEventListener('change', event => { studioProductOccasion = event.target.value; renderPicker(); }); $('#studioBudgetMin').addEventListener('input', event => { studioBudgetMin = event.target.value; renderPicker(); }); $('#studioBudgetMax').addEventListener('input', event => { studioBudgetMax = event.target.value; renderPicker(); }); $('#studioProductSortToggle').onclick = () => { studioSortMenuOpen = !studioSortMenuOpen; renderPicker(); }; document.querySelectorAll('[data-studio-product-sort]').forEach(button => button.onclick = () => { studioProductSort = button.dataset.studioProductSort; studioSortMenuOpen = false; renderPicker(); }); document.addEventListener('click', event => { if (studioSortMenuOpen && !event.target.closest('.studio-sort-control')) { studioSortMenuOpen = false; renderPicker(); } }); document.addEventListener('keydown', event => { if (event.key === 'Escape' && studioSortMenuOpen) { studioSortMenuOpen = false; renderPicker(); $('#studioProductSortToggle').focus(); } }); $('#clearCombo').onclick = clearCombo; $('#saveCombo').onclick = () => saveCombo();
$('#catalogueOccasion').addEventListener('change', renderCatalogueChoices); $('#exportCatalogue').onclick = exportCatalogue; $('#quoteOccasion').addEventListener('change', renderQuotes); $('#libraryEventFilter').addEventListener('change', event => { libraryEvent = event.target.value; renderLibrary(); }); $('#librarySearch').addEventListener('input', event => { librarySearch = event.target.value; renderLibrary(); }); $('#librarySort').addEventListener('change', event => { librarySort = event.target.value; renderLibrary(); }); $('#inventorySearch').addEventListener('input', event => { inventorySearch = event.target.value; inventoryPage = 1; renderInventory(); }); $('#inventoryStatus').addEventListener('change', event => { inventoryStatus = event.target.value; inventoryPage = 1; renderInventory(); }); $('#inventoryProduct').addEventListener('change', () => syncInventoryDialog(true)); $('#inventoryAction').addEventListener('change', () => syncInventoryDialog(false)); $('#expenseType').addEventListener('change', syncExpenseDialog); $('#deliveryMode').addEventListener('change', syncExpenseDialog); $('#distanceKm').addEventListener('input', syncExpenseDialog);
document.querySelectorAll('[data-contacts-tab]').forEach(button => button.onclick = () => setContactsTab(button.dataset.contactsTab)); $('#clientSearch').addEventListener('input', event => { clientSearch = event.target.value; renderContacts(); }); $('#vendorSearch').addEventListener('input', event => { vendorSearch = event.target.value; renderContacts(); });
['quoteClientName', 'quoteClientMobile', 'quoteDeliveryArea', 'quoteTitle', 'quoteCombo', 'quoteQuantity', 'quoteMargin', 'quoteEventDate', 'quoteDeliveryDate', 'quoteNetWrappingPrice', 'quoteDiscountPercent', 'quoteComplimentary', 'quoteSpecialRequest'].forEach(id => { const input = $(`#${id}`); input.addEventListener('input', renderQuotePreview); input.addEventListener('change', renderQuotePreview); }); $('#quoteNetWrapping').addEventListener('change', () => { syncNetWrappingPrice(); renderQuotePreview(); }); $('#addQuoteAdditionalCost').onclick = addQuoteAdditionalCost; $('#copyQuote').onclick = copyQuote; $('#exportQuote').onclick = exportQuote; $('#saveOrder').onclick = () => saveOrder(); $('#ordersFrom').addEventListener('change', event => { ordersFrom = event.target.value; refreshOrderRange(); }); $('#ordersTo').addEventListener('change', event => { ordersTo = event.target.value; refreshOrderRange(); }); $('#ordersThisYear').onclick = () => { const currentYear = currentYearDateRange(); const alreadySelected = ordersFrom === currentYear.from && ordersTo === currentYear.to; ordersFrom = currentYear.from; ordersTo = currentYear.to; refreshOrderRange(); notify(alreadySelected ? 'Already showing this year.' : 'Showing orders from 1 January to today.', 'success'); };
$('#passwordSignIn').addEventListener('submit', event => { event.preventDefault(); signInWithPassword(event.currentTarget); }); $('#signOut').onclick = () => signOut(); $('#claimWorkspace').onclick = () => claimWorkspace();
$('#productForm').addEventListener('submit', async event => { event.preventDefault(); try { await saveProduct(event.currentTarget); } catch (error) { notify(error.message || 'Could not save product.'); } });
$('#productForm').elements.rate.addEventListener('input', syncProductBufferDefault); $('#productForm').elements.buffer.addEventListener('input', event => { const form = event.currentTarget.form; form.dataset.bufferManuallyEdited = 'true'; syncProductRoundedPrice(); });
$('#clientForm').addEventListener('submit', async event => { event.preventDefault(); try { await saveClient(event.currentTarget); } catch (error) { notify(error.message || 'Could not save client.'); } }); $('#vendorForm').addEventListener('submit', async event => { event.preventDefault(); try { await saveVendor(event.currentTarget); } catch (error) { notify(error.message || 'Could not save vendor.'); } });
$('#inventoryForm').addEventListener('submit', async event => { event.preventDefault(); try { await saveInventory(event.currentTarget); } catch (error) { notify(error.message || 'Could not update stock.'); } });
$('#expenseForm').addEventListener('submit', async event => { event.preventDefault(); try { await saveExpense(event.currentTarget); } catch (error) { notify(error.message || 'Could not submit expense.'); } });

syncOccasionLists(); syncNetWrappingPrice(); renderAll();
if (db) {
  db.auth.getSession().then(({ data, error }) => error ? notify(error.message) : updateAccess(data.session)).catch(error => notify(error.message));
  db.auth.onAuthStateChange((_event, session) => { setTimeout(() => updateAccess(session).catch(error => notify(error.message)), 0); });
} else updateAccess(null);
