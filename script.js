import { initializeApp } from 'firebase/app';
import {
    getFirestore,
    doc,
    onSnapshot,
    updateDoc,
    setDoc,
    getDoc,
    collection
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth, signInAnonymously } from 'firebase/auth';

/* =========================================================
   FIREBASE CONFIG
   ========================================================= */
const firebaseConfig = {
    apiKey: "AIzaSyDpMvqqiMJF_bcoAOEC4gC9CJrvdDlJVMA",
    authDomain: "icepop-3ed45.firebaseapp.com",
    projectId: "icepop-3ed45",
    storageBucket: "icepop-3ed45.firebasestorage.app",
    messagingSenderId: "635220816671",
    appId: "1:635220816671:web:71a452ec17bacd3ee0b62a"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

const COLLECTION_NAME = 'sis';
const DOCUMENT_ID = 'LW1DtX6N4s0o97o1vaz';
const docRef = doc(db, COLLECTION_NAME, DOCUMENT_ID);
const PARTNER_ORDERS_COLLECTION = 'partner_orders';

const GROUP_OPTIONS = ['پیتزا', 'بەرگر', 'سپاگێتی', 'فینگەر', 'لەفە', 'مریشک', 'ماسی', 'خواردنەوەکان'];

/* =========================================================
   BUSINESS DAY UTILS
   ========================================================= */
function getBusinessDayStart(timestamp) {
    const d = new Date(timestamp);
    if (d.getHours() < 2 || (d.getHours() === 2 && d.getMinutes() < 30)) {
        const p = new Date(d);
        p.setDate(p.getDate() - 1);
        return new Date(p.getFullYear(), p.getMonth(), p.getDate(), 0, 0, 0, 0);
    }
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function isSameBusinessDay(a, b) {
    return getBusinessDayStart(a).getTime() === getBusinessDayStart(b).getTime();
}

function getCurrentBusinessDayStart() {
    return getBusinessDayStart(new Date());
}

function getDaysInMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function getMonthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function getMonthEnd(date) {
    return new Date(date.getFullYear(), date.getMonth(), getDaysInMonth(date), 23, 59, 59, 999);
}

function getMonthDays(ref = new Date()) {
    const days = [];
    const total = getDaysInMonth(ref);
    for (let i = 1; i <= total; i++) {
        days.push(new Date(ref.getFullYear(), ref.getMonth(), i));
    }
    return days;
}

function getMonthNameKurdish(date) {
    const months = [
        'کانونی دووەم', 'شوبات', 'ئازار', 'نیسان', 'ئایار', 'حوزەیران',
        'تەمموز', 'ئاب', 'ئەیلوول', 'تشرینی یەکەم', 'تشرینی دووەم', 'کانونی یەکەم'
    ];
    return months[new Date(date).getMonth()];
}

function formatDateKurdish(date) {
    const d = new Date(date);
    return `${d.getDate()} ${getMonthNameKurdish(d)} ${d.getFullYear()}`;
}

function getDayName(date) {
    return ['یەکشەممە', 'دووشەممە', 'سێشەممە', 'چوارشەممە', 'پێنجشەممە', 'هەینی', 'شەممە'][date.getDay()];
}

function formatPrice(p) {
    if (!p && p !== 0) return '0 د.ع';
    return Math.round(p).toLocaleString('en-US') + ' د.ع';
}

function now() {
    return new Date().toLocaleString('ku', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function toast(msg, isErr = false) {
    const t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' error' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function genId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
}

/* =========================================================
   STATE
   ========================================================= */
const state = {
    currentPage: 'login',
    currentRole: null,
    currentUser: null,
    managerTab: 'dashboard',
    items: [],
    orders: [],
    partnerOrders: [],
    partnerImages: { talabat: '', zuu: '', wade: '', leezu: '' },
    isLoading: true,
    firebaseError: null,
    unsubscribeItems: null,
    unsubscribeOrders: null,
    unsubscribePartnerOrders: null,
    showItemModal: false,
    editingItemId: null,
    selectedBranch: 'زانکۆ',
    dailyResetTimestamp: null,
    monthlyResetTimestamp: null
};

/* =========================================================
   RESETS
   ========================================================= */
async function performMonthlyReset() {
    const nowD = new Date();
    const bd = getCurrentBusinessDayStart();
    if (state.monthlyResetTimestamp) {
        const lr = new Date(state.monthlyResetTimestamp);
        const lb = getBusinessDayStart(lr);
        if (lb.getMonth() === bd.getMonth() && lb.getFullYear() === bd.getFullYear()) return;
    }
    state.monthlyResetTimestamp = nowD.toISOString();
    try {
        await updateDoc(docRef, {
            orders: [],
            monthlyResetTimestamp: state.monthlyResetTimestamp,
            lastUpdated: new Date().toISOString()
        });
    } catch (e) {
        console.error(e);
    }
    state.orders = [];
}

async function checkAndApplyResets() {
    const bd = getCurrentBusinessDayStart();
    if (state.monthlyResetTimestamp) {
        const lb = getBusinessDayStart(new Date(state.monthlyResetTimestamp));
        if (lb.getMonth() !== bd.getMonth() || lb.getFullYear() !== bd.getFullYear()) {
            await performMonthlyReset();
        }
    }
}

async function loadResetTimestamps() {
    try {
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            const data = snap.data();
            if (data.monthlyResetTimestamp) {
                state.monthlyResetTimestamp = data.monthlyResetTimestamp;
            }
            await checkAndApplyResets();
        }
    } catch (e) {
        console.error(e);
    }
}

/* =========================================================
   FIRESTORE LOADERS
   ========================================================= */
function loadItemsFromFirestore() {
    if (state.unsubscribeItems) state.unsubscribeItems();
    try {
        state.unsubscribeItems = onSnapshot(docRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                state.items = (data.items || []).map(item => ({
                    id: item.id || genId(),
                    name: item.naw || 'بێ ناو',
                    price: item.nrx || 0,
                    group: item.grwp || 'گشتی',
                    image: item.link || '',
                    branch: item.branch || 'زانکۆ',
                    partnerPrices: {
                        talabat: item.nt ?? null,
                        zuu: item.nz ?? null,
                        wade: item.nw ?? null,
                        leezu: item.nl ?? null
                    }
                }));
                if (data.partnerImages) state.partnerImages = data.partnerImages;
                if (data.monthlyResetTimestamp) state.monthlyResetTimestamp = data.monthlyResetTimestamp;
                state.isLoading = false;
                render();
            } else {
                createDefaultDocument();
            }
        }, (err) => {
            state.firebaseError = err.message;
            state.isLoading = false;
            render();
        });
    } catch (e) {
        console.error(e);
        state.isLoading = false;
        render();
    }
}

async function createDefaultDocument() {
    try {
        const defaults = [
            { id: 'p1', naw: 'پیتزا مەرگ', nrx: 12000, grwp: 'پیتزا', link: '', branch: 'زانکۆ', nt: 14000, nz: 13000, nw: 12500, nl: 13500 },
            { id: 'p2', naw: 'پیتزا مەک', nrx: 10000, grwp: 'پیتزا', link: '', branch: 'زانکۆ', nt: 12000, nz: 11000, nw: 10500, nl: 11500 },
            { id: 'g1', naw: 'شاورما گەس', nrx: 8000, grwp: 'مریشک', link: '', branch: 'زانکۆ', nt: 10000, nz: 9000, nw: 8500, nl: 9500 },
            { id: 'd1', naw: 'پەپسی', nrx: 2000, grwp: 'خواردنەوەکان', link: '', branch: 'زانکۆ', nt: 3000, nz: 2500, nw: 2000, nl: 2500 }
        ];
        await setDoc(docRef, {
            items: defaults,
            partnerImages: { talabat: '', zuu: '', wade: '', leezu: '' },
            orders: [],
            lastUpdated: new Date().toISOString(),
            monthlyResetTimestamp: new Date().toISOString()
        });
        loadItemsFromFirestore();
    } catch (e) {
        console.error(e);
    }
}

async function saveItemsToFirestore() {
    try {
        const itemsData = state.items.map(item => ({
            id: item.id,
            naw: item.name,
            nrx: item.price,
            grwp: item.group,
            link: item.image || '',
            branch: item.branch || 'زانکۆ',
            nt: item.partnerPrices?.talabat ?? null,
            nz: item.partnerPrices?.zuu ?? null,
            nw: item.partnerPrices?.wade ?? null,
            nl: item.partnerPrices?.leezu ?? null
        }));
        await updateDoc(docRef, { items: itemsData, lastUpdated: new Date().toISOString() });
        toast('✅ سەیڤ کرا');
    } catch (e) {
        toast('هەڵە لە سەیڤکردن', true);
    }
}

function loadOrdersFromFirestore() {
    if (state.unsubscribeOrders) state.unsubscribeOrders();
    state.unsubscribeOrders = onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            state.orders = data.orders || [];
            if (data.monthlyResetTimestamp) state.monthlyResetTimestamp = data.monthlyResetTimestamp;
            checkAndApplyResets();
            render();
        }
    });
}

function loadPartnerOrdersFromFirestore() {
    if (state.unsubscribePartnerOrders) state.unsubscribePartnerOrders();
    state.unsubscribePartnerOrders = onSnapshot(collection(db, PARTNER_ORDERS_COLLECTION), (snap) => {
        const arr = [];
        snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
        state.partnerOrders = arr;
        render();
    });
}

/* =========================================================
   RENDER
   ========================================================= */
function render() {
    const app = document.getElementById('app');
    if (!app) return;

    if (state.isLoading) {
        app.innerHTML = `<div class="loading-overlay"><div class="spinner"></div><div>⏳ چاوەڕێ بکە...</div></div>`;
        return;
    }
    if (state.firebaseError && state.items.length === 0) {
        app.innerHTML = `<div class="error-container"><h2>⚠️ هەڵە</h2><p>${state.firebaseError}</p><button class="btn" onclick="location.reload()">🔄 هەوڵدانەوە</button></div>`;
        return;
    }

    let html = '';
    if (state.currentPage === 'login') html = renderLogin();
    else if (state.currentPage === 'manager') html = renderManager();

    app.innerHTML = html;

    if (state.showItemModal) app.innerHTML += renderItemModal();
    attachEvents();
}

function renderLogin() {
    return `
        <div class="login-page">
            <div class="login-box">
                <div class="logo-text">👨‍💼 <span>بەڕێوەبەر</span></div>
                <p class="subtitle">چێشتخانەی ئایس پۆپ</p>
                <h2>چوونە ژوورەوە</h2>
                <input type="text" id="username" placeholder="ناوی بەکارهێنەر" />
                <input type="password" id="password" placeholder="تێپەڕەوشە" />
                <button class="btn" data-action="login-manager">چوونە ژوور</button>
            </div>
        </div>
    `;
}

function renderManager() {
    return renderManagerFull();
}

function renderManagerFull() {
    let filteredItems = state.items.filter(i => i.branch === state.selectedBranch);
    const itemsHtml = filteredItems.map(item => `
        <tr>
            <td>${item.image ? `<img src="${item.image}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;" onerror="this.style.display='none';"/>` : '🍽️'} ${item.name} <span class="branch-tag zanco">${item.branch}</span></td>
            <td>${formatPrice(item.price)}</td>
            <td>${item.partnerPrices ? Object.entries(item.partnerPrices).filter(([k, v]) => v != null).map(([k, v]) => `${k}: ${formatPrice(v)}`).join('<br/>') : '-'}</td>
            <td>${item.group || 'گشتی'}</td>
            <td>
                <button class="btn btn-sm btn-warning" data-action="edit-item" data-id="${item.id}">✏️</button>
                <button class="btn btn-sm btn-danger" data-action="delete-item" data-id="${item.id}">🗑️</button>
            </td>
        </tr>`).join('');

    const todayOrders = state.orders.filter(o => isSameBusinessDay(o.timestamp, Date.now()) && (o.orderType === 'dine' || o.orderType === 'takeaway'));
    const totalRev = todayOrders.reduce((s, o) => s + (o.total || 0), 0);
    const morning = todayOrders.filter(o => o.shift === 'morning');
    const night = todayOrders.filter(o => o.shift === 'night');
    const morningRev = morning.reduce((s, o) => s + (o.total || 0), 0);
    const nightRev = night.reduce((s, o) => s + (o.total || 0), 0);

    const cashierStats = {};
    todayOrders.forEach(o => {
        if (o.cashier) cashierStats[o.cashier] = (cashierStats[o.cashier] || 0) + 1;
    });
    const cashierStatsHtml = Object.entries(cashierStats).length
        ? Object.entries(cashierStats).map(([n, c]) => `<div class="stat-card"><div class="number">${c}</div><div class="label">${n}</div></div>`).join('')
        : '<p style="grid-column:1/-1;color:#94a3b8;">هیچ داتایەک نییە</p>';

    return `
        <div>
            <div class="header-bar">
                <div class="title">👨‍💼 بەڕێوەبەر <span class="live-indicator"></span> لایڤ</div>
                <div class="user-info">${state.currentUser || 'بەڕێوەبەر'} | ${now()}</div>
                <button class="back-btn" data-action="logout">🚪 دەرچوون</button>
            </div>

            <div class="manager-menu">
                <button class="${state.managerTab === 'dashboard' ? 'active' : ''}" data-action="manager-tab" data-tab="dashboard">📊 داشبۆرد</button>
                <button class="${state.managerTab === 'items' ? 'active' : ''}" data-action="manager-tab" data-tab="items">🛒 ئایتمەکان</button>
                <button class="${state.managerTab === 'partner-detail' ? 'active' : ''}" data-action="manager-tab" data-tab="partner-detail">📊 شەریکە</button>
                <button class="${state.managerTab === 'monthly-trend' ? 'active' : ''}" data-action="manager-tab" data-tab="monthly-trend">📈 ڕەوتی مانگانە</button>
            </div>

            ${state.managerTab === 'dashboard' ? `
                <div class="dashboard">
                    <h3 style="font-size:18px;margin-bottom:10px;">📊 داشبۆردی ساڵە و سەفەری <span class="live-indicator"></span> لایڤ</h3>
                    <div class="stats-grid">
                        <div class="stat-card"><div class="number">${formatPrice(morningRev)}</div><div class="label">شەفتی بەیانی (٩-٥:٣٠)</div></div>
                        <div class="stat-card"><div class="number">${formatPrice(nightRev)}</div><div class="label">شەفتی شەو (٥:٣٠-٣)</div></div>
                        <div class="stat-card"><div class="number">${formatPrice(totalRev)}</div><div class="label">کۆی داهاتی ئەمڕۆ</div></div>
                    </div>
                    <div class="stats-grid">
                        <div class="stat-card"><div class="number">${morning.length}</div><div class="label">ئۆردەری بەیانی</div></div>
                        <div class="stat-card"><div class="number">${night.length}</div><div class="label">ئۆردەری شەو</div></div>
                        <div class="stat-card"><div class="number">${todayOrders.length}</div><div class="label">کۆی ئۆردەر</div></div>
                    </div>
                    <h4 style="font-size:15px;margin:12px 0 8px;">📊 ئاماری کاشێرەکان</h4>
                    <div class="stats-grid">${cashierStatsHtml}</div>
                    <h4 style="font-size:15px;margin:12px 0 8px;">📋 کۆی ئۆردەرەکان</h4>
                    <div style="max-height:250px;overflow-y:auto;border:2px solid #e2e8f0;border-radius:10px;padding:8px;">
                        ${todayOrders.length ? todayOrders.map((o, i) => `
                            <div class="order-item" style="border-right-color:${o.orderType === 'dine' ? '#3498db' : '#f39c12'};">
                                <span style="font-weight:700;color:#6c5ce7;">${i + 1}</span>
                                <span class="order-type-badge ${o.orderType}">${o.orderType === 'dine' ? '🍽️ ساڵە' : '🛍️ سەفەری'}</span>
                                <span style="flex:1;">${o.items.map(it => `${it.name} ×${it.qty}`).join('، ')}</span>
                                <span style="font-weight:700;">${formatPrice(o.total)}</span>
                                ${o.discount > 0 ? `<span style="font-size:9px;color:#e17055;">🔖%${o.discount}</span>` : ''}
                                <span style="font-size:11px;color:#64748b;">${o.time}</span>
                                <span style="font-size:11px;color:#64748b;">${o.cashier || ''}</span>
                            </div>`).join('') : '<p style="color:#94a3b8;text-align:center;padding:16px;">هیچ ئۆردەرێک نییە</p>'}
                    </div>
                </div>` : ''}

            ${state.managerTab === 'items' ? `
                <div class="dashboard">
                    <h3 style="font-size:18px;margin-bottom:10px;">🛒 بەڕێوەبردنی ئایتمەکان</h3>
                    <button class="btn btn-primary" data-action="show-add-item" style="width:auto;display:inline-block;padding:8px 20px;font-size:14px;">➕ زیاد کردنی ئایتم</button>
                    <div style="overflow-x:auto;margin-top:12px;">
                        <table>
                            <thead><tr><th>ناو / لق</th><th>نرخ</th><th>نرخی شەریکە</th><th>گرووپ</th><th>کردار</th></tr></thead>
                            <tbody>${itemsHtml || '<tr><td colspan="5" style="color:#94a3b8;">هیچ ئایتمێک نییە</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>` : ''}

            ${state.managerTab === 'partner-detail' ? renderPartnerDetail() : ''}
            ${state.managerTab === 'monthly-trend' ? renderMonthlyTrend() : ''}
        </div>
    `;
}

function renderPartnerDetail() {
    const partnerOrders = state.partnerOrders.filter(o => isSameBusinessDay(o.timestamp, Date.now()));
    return `
        <div class="dashboard" style="margin-top:16px;">
            <h3 style="font-size:18px;margin-bottom:10px;">📊 دیتەیڵی شەریکەکان <span class="live-indicator"></span></h3>
            <div class="partner-detail-grid">
                ${['talabat', 'zuu', 'wade', 'leezu'].map(p => {
                    const orders = partnerOrders.filter(o => o.partner === p);
                    const total = orders.reduce((s, o) => s + (o.total || 0), 0);
                    const logo = `https://i.ibb.co/${p === 'talabat' ? 'gMT6mBmc' : p === 'zuu' ? 'gMT6mBmc' : p === 'wade' ? 'gMT6mBmc' : 'gMT6mBmc'}/unnamed.webp`;
                    return `
                        <div class="partner-detail-card" data-partner="${p}">
                            <div class="partner-detail-header">
                                <img src="${logo}" class="partner-detail-logo" onerror="this.style.display='none';"/>
                                <span class="partner-detail-name">${p.toUpperCase()}</span>
                            </div>
                            <div class="partner-detail-stats">
                                <div class="partner-stat"><span class="partner-stat-number">${orders.length}</span><span class="partner-stat-label">کۆی ئۆردەر</span></div>
                                <div class="partner-stat"><span class="partner-stat-number">${formatPrice(total)}</span><span class="partner-stat-label">کۆی داهات</span></div>
                            </div>
                            <div class="partner-detail-orders">
                                ${orders.length ? orders.map(o => `
                                    <div class="partner-order-item">
                                        <span class="partner-order-id">#${o.id || 'N/A'}</span>
                                        <span class="partner-order-items">${o.items ? o.items.map(i => `${i.name} ×${i.qty}`).join('، ') : ''}</span>
                                        ${o.partnerCode ? `<span class="partner-order-code">📦 ${o.partnerCode}</span>` : ''}
                                        <span class="partner-order-total">${formatPrice(o.total || 0)}</span>
                                        <span class="partner-order-time">${o.time || ''}</span>
                                    </div>`).join('') : '<p class="no-orders">هیچ ئۆردەرێک نییە</p>'}
                            </div>
                        </div>`;
                }).join('')}
            </div>
        </div>`;
}

function renderMonthlyTrend() {
    const monthDays = getMonthDays();
    const monthStart = getMonthStart(new Date());
    const monthEnd = getMonthEnd(new Date());
    const monthName = getMonthNameKurdish(new Date());
    const year = new Date().getFullYear();
    const totalDays = monthDays.length;

    const monthlyFiltered = state.orders.filter(o => !(o.partner && o.orderType === 'partner') && (o.orderType === 'dine' || o.orderType === 'takeaway'));

    const dayData = monthDays.map(day => {
        const dayOrders = monthlyFiltered.filter(o => getBusinessDayStart(o.timestamp).getTime() === getBusinessDayStart(day).getTime());
        return { day, total: dayOrders.reduce((s, o) => s + (o.total || 0), 0), count: dayOrders.length };
    });

    const maxTotal = Math.max(...dayData.map(d => d.total), 1);
    const monthlyTotal = dayData.reduce((s, d) => s + d.total, 0);
    const avgDaily = totalDays > 0 ? Math.round(monthlyTotal / totalDays) : 0;
    const totalOrders = dayData.reduce((s, d) => s + d.count, 0);
    const todayStr = new Date().toDateString();

    const cards = dayData.map(d => {
        const isToday = d.day.toDateString() === todayStr;
        const hasData = d.total > 0;
        const isMax = d.total > 0 && d.total === maxTotal;
        const bar = Math.max((d.total / maxTotal) * 100, 0);
        let cls = 'day-card' + (isToday ? ' today' : '') + (hasData ? ' has-data' : ' empty');
        return `
            <div class="${cls}">
                ${isMax ? '<span class="day-badge max">⭐ بەرزترین</span>' : (isToday ? '<span class="day-badge">ئەمڕۆ</span>' : '')}
                <div class="day-header"><span class="day-num">${d.day.getDate()}</span><span class="day-name">${getDayName(d.day)}</span></div>
                <div class="day-amount">${hasData ? formatPrice(d.total) : '0 د.ع'}</div>
                <div class="day-orders-count"><span class="dot" style="background:${hasData ? '#00b894' : '#cbd5e1'}"></span>${d.count} ئۆردەر</div>
                <div class="day-bar"><div class="day-bar-fill" style="width:${bar}%"></div></div>
            </div>`;
    }).join('');

    return `
        <div class="monthly-trend-page">
            <div class="monthly-trend-header">
                <h3>📈 ڕەوتی مانگانە <span class="live-indicator"></span></h3>
                <div class="monthly-trend-summary">
                    <div class="summary-box"><span class="val">${formatPrice(monthlyTotal)}</span><span class="lbl">کۆی مانگ</span></div>
                    <div class="summary-box alt"><span class="val">${formatPrice(avgDaily)}</span><span class="lbl">تێکڕای ڕۆژانە</span></div>
                    <div class="summary-box alt2"><span class="val">${totalOrders}</span><span class="lbl">کۆی ئۆردەر</span></div>
                </div>
            </div>
            <div class="month-info-bar">
                <span class="month-name">📅 ${monthName} ${year}</span>
                <span class="month-dates">${formatDateKurdish(monthStart)} → ${formatDateKurdish(monthEnd)}</span>
                <span class="month-days-count">${totalDays} ڕۆژ</span>
            </div>
            <div class="day-cards-grid">${cards}</div>
        </div>`;
}

function renderItemModal() {
    const isEdit = !!state.editingItemId;
    const item = isEdit ? state.items.find(i => i.id === state.editingItemId) : null;
    return `
        <div class="modal-overlay" id="item-modal-overlay">
            <div class="modal">
                <button class="close-btn" id="close-item-modal">✕</button>
                <h3>${isEdit ? '✏️ نوێ کردنەوە' : '➕ زیاد کردن'}</h3>
                <div class="form-group"><label>ناو</label><input type="text" id="item-name" value="${item ? item.name : ''}"/></div>
                <div class="form-group"><label>نرخ</label><input type="number" id="item-price" value="${item ? item.price : ''}" step="100"/></div>
                <div class="form-group"><label>گرووپ</label>
                    <select id="item-group">
                        <option value="">-- هەڵبژێرە --</option>
                        ${GROUP_OPTIONS.map(g => `<option value="${g}" ${item && item.group === g ? 'selected' : ''}>${g}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group"><label>لینکی وێنە</label><input type="text" id="item-image" value="${item ? item.image || '' : ''}"/></div>
                <hr style="margin:12px 0;border-color:#e2e8f0;"/>
                <h4 style="margin-bottom:8px;">نرخی شەریکەکان</h4>
                ${['talabat', 'zuu', 'wade', 'leezu'].map(p => `
                    <div class="form-group"><label>${p.toUpperCase()}</label>
                        <input type="number" id="partner-price-${p}" value="${item && item.partnerPrices && item.partnerPrices[p] != null ? item.partnerPrices[p] : ''}" step="100"/>
                    </div>`).join('')}
                <div class="flex" style="margin-top:12px;gap:8px;">
                    <button class="btn" id="save-item-btn" style="flex:1;">${isEdit ? '💾 نوێکردنەوە' : '➕ زیادکردن'}</button>
                    <button class="btn btn-danger" id="cancel-item-btn" style="flex:1;">🚫 ڕەتکردنەوە</button>
                </div>
            </div>
        </div>`;
}

/* =========================================================
   EVENTS
   ========================================================= */
function attachEvents() {
    document.querySelectorAll('[data-action="login-manager"]').forEach(el => {
        el.onclick = () => {
            const u = document.getElementById('username')?.value.trim();
            const p = document.getElementById('password')?.value.trim();
            if (u === 's4ng4r' && p === 's2026s') {
                state.currentUser = u;
                state.currentRole = 'manager';
                state.currentPage = 'manager';
                state.managerTab = 'dashboard';
                toast('بەخێربێیت بەڕێوەبەر');
                render();
            } else {
                toast('ناو یان تێپەڕەوشە هەڵەیە', true);
            }
        };
    });

    document.querySelectorAll('[data-action="logout"]').forEach(el => {
        el.onclick = () => {
            state.currentPage = 'login';
            state.currentUser = null;
            state.currentRole = null;
            state.showItemModal = false;
            state.editingItemId = null;
            render();
        };
    });

    document.querySelectorAll('[data-action="manager-tab"]').forEach(el => {
        el.onclick = () => { state.managerTab = el.dataset.tab; render(); };
    });

    document.querySelectorAll('[data-action="show-add-item"]').forEach(el => {
        el.onclick = () => { state.showItemModal = true; state.editingItemId = null; render(); };
    });

    document.querySelectorAll('[data-action="edit-item"]').forEach(el => {
        el.onclick = () => { state.editingItemId = el.dataset.id; state.showItemModal = true; render(); };
    });

    document.querySelectorAll('[data-action="delete-item"]').forEach(el => {
        el.onclick = async () => {
            if (confirm('دڵنیای؟')) {
                state.items = state.items.filter(i => i.id !== el.dataset.id);
                await saveItemsToFirestore();
                render();
            }
        };
    });

    const closeBtn = document.getElementById('close-item-modal');
    if (closeBtn) closeBtn.onclick = () => { state.showItemModal = false; state.editingItemId = null; render(); };

    const cancelBtn = document.getElementById('cancel-item-btn');
    if (cancelBtn) cancelBtn.onclick = () => { state.showItemModal = false; state.editingItemId = null; render(); };

    const overlay = document.getElementById('item-modal-overlay');
    if (overlay) overlay.onclick = (e) => {
        if (e.target === overlay) {
            state.showItemModal = false;
            state.editingItemId = null;
            render();
        }
    };

    const saveBtn = document.getElementById('save-item-btn');
    if (saveBtn) saveBtn.onclick = async () => {
        const name = document.getElementById('item-name')?.value.trim();
        const price = parseFloat(document.getElementById('item-price')?.value);
        const group = document.getElementById('item-group')?.value.trim();
        const image = document.getElementById('item-image')?.value.trim();

        if (!name) return toast('ناو داخل بکە', true);
        if (isNaN(price) || price <= 0) return toast('نرخی دروست داخل بکە', true);

        const pp = {};
        ['talabat', 'zuu', 'wade', 'leezu'].forEach(p => {
            const v = document.getElementById(`partner-price-${p}`)?.value;
            pp[p] = v && !isNaN(parseFloat(v)) ? parseFloat(v) : null;
        });

        if (state.editingItemId) {
            const it = state.items.find(i => i.id === state.editingItemId);
            if (it) {
                it.name = name;
                it.price = price;
                it.group = group || 'گشتی';
                it.image = image || '';
                it.partnerPrices = pp;
            }
        } else {
            state.items.push({
                id: genId(),
                name,
                price,
                group: group || 'گشتی',
                branch: 'زانکۆ',
                image: image || '',
                partnerPrices: pp
            });
        }

        await saveItemsToFirestore();
        state.showItemModal = false;
        state.editingItemId = null;
        render();
    };

    document.querySelectorAll('.partner-detail-card').forEach(el => {
        el.onclick = () => {
            el.classList.toggle('expanded');
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
    });
}

/* =========================================================
   INIT
   ========================================================= */
async function init() {
    state.isLoading = true;
    render();
    try {
        try { await signInAnonymously(auth); } catch (e) { /* silent */ }
        await loadResetTimestamps();
        loadItemsFromFirestore();
        loadOrdersFromFirestore();
        loadPartnerOrdersFromFirestore();
        setInterval(() => checkAndApplyResets(), 60000);
    } catch (e) {
        state.firebaseError = e.message;
        state.isLoading = false;
        render();
    }
}

init();