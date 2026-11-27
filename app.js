/**
 * MintCream Budget — ตัวควบคุมหน้าจอ (UI Controller)
 * เขียนด้วย Vanilla JavaScript (ES Modules) อ่านง่าย ไม่ต้องมี build step
 */

import { BudgetStore } from './store.js';
import {
  getTodayBangkok,
  getMondayWeekRange,
  getMonthRange,
  getPreviousMonthKey,
  addDays,
  formatThaiDate,
  formatThaiMonthYear,
  formatBaht,
  escapeHtml,
  calculateDailyBudget,
  estimateActualSpending,
  calculateGoalFeasibility,
  buildWeeklySavingsPlan,
  transactionsToCSV,
  parseTransactionsCSV
} from './utils.js';

const store = new BudgetStore();

// สถานะหน้าจอปัจจุบัน
const uiState = {
  activeView: 'dashboard',
  showFormula: false,
  txFilter: {
    search: '',
    period: 'month', // week | month | all | custom
    type: 'all',
    categoryId: 'all',
    customStart: '',
    customEnd: ''
  },
  reportPeriod: 'month', // week | month | all
  whatIf: {
    initialized: false,
    monthlyShopee: 1750,
    monthlyAi: 1000,
    weeklyFood: 950
  },
  sheetType: 'expense',
  sheetCategoryId: null,
  deferredInstallPrompt: null,
  charts: {}
};

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  transactions: 'รายการทั้งหมด',
  goal: 'เป้าหมายโน้ตบุ๊ก',
  reports: 'รายงานและกราฟ',
  settings: 'ตั้งค่า'
};

const PASTEL_COLORS = [
  '#A8E6CF', '#FFB7A5', '#B5D8F7', '#FFF1B8',
  '#FFD3B6', '#D8C7FF', '#FFC9DE', '#BCEAD5', '#E2ECE9'
];

const WEEKDAY_OPTIONS = [
  { value: 1, label: 'วันจันทร์' },
  { value: 2, label: 'วันอังคาร' },
  { value: 3, label: 'วันพุธ' },
  { value: 4, label: 'วันพฤหัสบดี' },
  { value: 5, label: 'วันศุกร์' },
  { value: 6, label: 'วันเสาร์' },
  { value: 0, label: 'วันอาทิตย์' }
];

// ---------------------------------------------------------
// เริ่มต้นแอปพลิเคชัน
// ---------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  registerServiceWorker();
  setupInstallPrompt();
  bindGlobalEvents();

  const todayIso = getTodayBangkok();
  document.getElementById('page-date').textContent = `วันนี้ ${formatThaiDate(todayIso, true)}`;

  store.subscribe((state, meta) => {
    handleAuthAndSyncUI(meta);
    syncWhatIfDefaults(state);
    renderActiveView();
    checkGoalMilestones(state);
  });

  await store.init();
});

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('ลงทะเบียน Service Worker ไม่สำเร็จ:', err);
    });
  }
}

function setupInstallPrompt() {
  const installBtn = document.getElementById('btn-install-pwa');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    uiState.deferredInstallPrompt = e;
    installBtn.classList.remove('hidden');
  });

  installBtn.addEventListener('click', async () => {
    if (!uiState.deferredInstallPrompt) return;
    uiState.deferredInstallPrompt.prompt();
    await uiState.deferredInstallPrompt.userChoice;
    uiState.deferredInstallPrompt = null;
    installBtn.classList.add('hidden');
  });
}

function handleAuthAndSyncUI(meta) {
  const authGate = document.getElementById('auth-gate');
  const appShell = document.getElementById('app-shell');
  const localBanner = document.getElementById('local-mode-banner');
  const syncText = getSyncPillText(meta);

  document.getElementById('sidebar-sync-pill').textContent = syncText;
  document.getElementById('mobile-sync-pill').textContent = syncText;

  if (meta.mode === 'firebase' && !meta.user) {
    authGate.classList.remove('hidden');
    appShell.classList.add('hidden');
  } else {
    authGate.classList.add('hidden');
    appShell.classList.remove('hidden');
  }

  if (meta.mode === 'local') {
    localBanner.classList.remove('hidden');
  } else {
    localBanner.classList.add('hidden');
  }
}

function getSyncPillText(meta) {
  if (meta.mode === 'local') return '🌿 โหมดบนเครื่อง';
  if (meta.syncStatus === 'syncing' || meta.syncStatus === 'connecting') return '🔄 กำลังซิงก์...';
  if (!navigator.onLine || meta.syncStatus === 'offline') return '☁️ ออฟไลน์ (รอซิงก์)';
  if (meta.user) return '🟢 ซิงก์ข้ามเครื่องแล้ว';
  return '🔐 รอเข้าสู่ระบบ';
}

function syncWhatIfDefaults(state) {
  if (uiState.whatIf.initialized) return;
  const est = estimateActualSpending({
    transactions: state.transactions,
    categories: state.categories,
    settings: state.settings
  });
  const aiItem = state.recurring.find((r) => r.id === 'rec_ai' || /ai/i.test(r.name || ''));
  uiState.whatIf = {
    initialized: true,
    monthlyShopee: est.avgMonthlyShopee,
    monthlyAi: aiItem ? Number(aiItem.amount) : 1000,
    weeklyFood: est.avgWeeklyFood
  };
}

// ---------------------------------------------------------
// ผูกเหตุการณ์ปุ่มหลักของแอป
// ---------------------------------------------------------
function bindGlobalEvents() {
  // ปุ่มเข้าสู่ระบบ Google
  document.getElementById('btn-google-signin').addEventListener('click', async () => {
    try {
      await store.signInWithGoogle();
    } catch (err) {
      showToast(`เข้าสู่ระบบไม่สำเร็จ: ${err.message}`);
    }
  });

  // เปลี่ยนหน้า (Sidebar + Bottom Nav + Mobile Settings)
  document.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // ปุ่ม "+" ลอยบนมือถือ และปุ่มเพิ่มรายการบนคอม
  document.getElementById('mobile-fab-btn').addEventListener('click', () => openTransactionSheet());
  document.getElementById('desktop-add-btn').addEventListener('click', () => openTransactionSheet());

  // เหตุการณ์ใน Bottom Sheet บันทึกรายการ
  bindTransactionSheetEvents();

  // ปิด Modal อเนกประสงค์
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  // อัปเดตสถานะออนไลน์/ออฟไลน์
  window.addEventListener('online', () => store.notify());
  window.addEventListener('offline', () => store.notify());
}

function switchView(viewName) {
  uiState.activeView = viewName;
  document.getElementById('page-title').textContent = VIEW_TITLES[viewName] || 'Dashboard';

  document.querySelectorAll('.view').forEach((el) => {
    el.classList.toggle('hidden', el.id !== `view-${viewName}`);
    el.classList.toggle('active', el.id === `view-${viewName}`);
  });

  document.querySelectorAll('[data-view]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  renderActiveView();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderActiveView() {
  destroyCharts();
  switch (uiState.activeView) {
    case 'dashboard':
      renderDashboard();
      break;
    case 'transactions':
      renderTransactionsView();
      break;
    case 'goal':
      renderGoalView();
      break;
    case 'reports':
      renderReportsView();
      break;
    case 'settings':
      renderSettingsView();
      break;
  }
}

// ---------------------------------------------------------
// 4.1 หน้า Dashboard (หน้าแรก)
// ---------------------------------------------------------
function renderDashboard() {
  const container = document.getElementById('view-dashboard');
  const { transactions, categories, recurring, goal, settings } = store.state;
  const todayIso = getTodayBangkok();
  const monthRange = getMonthRange(todayIso);

  const budget = calculateDailyBudget({ todayIso, transactions, recurring, goal, settings });
  const feasibility = calculateGoalFeasibility({ todayIso, goal, transactions, recurring, settings });
  const monthlyBills = store.getMonthlyRecurringStatus(todayIso);
  const pendingBills = monthlyBills.filter((b) => !b.isPaid);

  // สรุปเดือนนี้
  const monthTx = transactions.filter((t) => t.date >= monthRange.start && t.date <= monthRange.end);
  const monthIncome = monthTx.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const monthExpense = monthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const monthSavings = monthTx.filter((t) => t.type === 'savings').reduce((s, t) => s + Number(t.amount), 0);
  const monthBalance = monthIncome - monthExpense - monthSavings;
  const savingRate = monthIncome > 0 ? Math.max(0, Math.round(((monthIncome - monthExpense) / monthIncome) * 100)) : 0;

  const latest5 = transactions.slice(0, 5);
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));

  container.innerHTML = `
    <!-- การ์ดหลัก: งบใช้ได้วันนี้ -->
    <article class="card hero-budget-card ${budget.isOverToday ? 'is-resting' : ''}">
      <span class="hero-label">🌿 งบใช้ได้วันนี้</span>
      <div class="hero-amount">${formatBaht(budget.safeDailyBudget)}</div>
      <p class="hero-message">${escapeHtml(budget.gentleMessage)}</p>

      <div class="hero-submetrics">
        <span>ใช้ไปแล้ววันนี้ <strong>${formatBaht(budget.spentToday)}</strong></span>
        <span>•</span>
        <span>เหลือวันนี้ <strong>${formatBaht(budget.remainingToday)}</strong></span>
        <span>•</span>
        <span>เหลืออีก <strong>${budget.remainingDaysInWeek} วัน</strong> ในสัปดาห์นี้</span>
      </div>

      <div class="formula-toggle">
        <button id="btn-toggle-formula" class="btn btn-soft btn-sm" type="button">
          ${uiState.showFormula ? 'ซ่อนวิธีคำนวณ ▲' : 'ดูวิธีคำนวณ ▼'}
        </button>
      </div>

      <div id="formula-breakdown" class="formula-box ${uiState.showFormula ? '' : 'hidden'}">
        <div class="formula-row"><span>รายรับคาดการณ์สัปดาห์นี้</span><strong>${formatBaht(budget.expectedWeeklyIncome)}</strong></div>
        <div class="formula-row"><span>หัก เงินกันเก็บเข้าเป้าหมาย/สัปดาห์</span><strong>-${formatBaht(budget.requiredWeeklyGoalSavings)}</strong></div>
        <div class="formula-row"><span>หัก ส่วนแบ่งรายจ่ายประจำ + Shopee/สัปดาห์</span><strong>-${formatBaht(budget.weeklyFixedAndShopeeReserve)}</strong></div>
        <div class="formula-row"><span>หัก ใช้จ่ายไปแล้วในสัปดาห์นี้ (${formatThaiDate(budget.weekStart)}–${formatThaiDate(budget.weekEnd)})</span><strong>-${formatBaht(budget.spentThisWeek)}</strong></div>
        <div class="formula-row total"><span>หารจำนวนวันที่เหลือในสัปดาห์ (${budget.remainingDaysInWeek} วัน)</span><strong>${formatBaht(budget.safeDailyBudget)} / วัน</strong></div>
      </div>
    </article>

    <!-- แจ้งเตือนบิลประจำรายเดือนที่รอจ่าย (แบบนุ่มนวล) -->
    ${pendingBills.length ? `
      <article class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">🗓️ รายจ่ายประจำเดือน ${formatThaiMonthYear(monthRange.monthKey)}</h2>
            <p class="card-subtitle">กดติ๊ก "จ่ายแล้ว" เมื่อชำระเรียบร้อย เพื่อบันทึกอัตโนมัติ</p>
          </div>
        </div>
        <div class="tx-list">
          ${pendingBills.map((b) => `
            <div class="bill-row">
              <div>
                <strong>${escapeHtml(b.name)}</strong>
                <div class="tx-sub">กำหนดทุกวันที่ ${b.dueDay || 1} • ${formatBaht(b.amount)} <span class="badge badge-pending">รอจ่าย</span></div>
              </div>
              <button class="btn btn-primary btn-sm" data-pay-bill="${escapeHtml(b.id)}" type="button">✓ จ่ายแล้ว</button>
            </div>
          `).join('')}
        </div>
      </article>
    ` : ''}

    <!-- การ์ดเป้าหมายโน้ตบุ๊ก -->
    <article class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">💻 ${escapeHtml(goal.name)}</h2>
          <p class="card-subtitle">เป้าหมาย ${formatThaiDate(goal.targetDate)}</p>
        </div>
        <button class="btn btn-goal btn-sm" id="dash-quick-save-btn" type="button">+ ออมเข้าเป้า</button>
      </div>
      <div class="goal-stats-row">
        <span>เก็บได้แล้ว <strong>${formatBaht(feasibility.totalSaved)}</strong> จาก <strong>${formatBaht(feasibility.targetAmount)}</strong></span>
        <strong>${feasibility.progressPercent}%</strong>
      </div>
      <div class="progress-track" role="progressbar" aria-valuenow="${feasibility.progressPercent}" aria-valuemin="0" aria-valuemax="100">
        <div class="progress-fill" style="width: ${feasibility.progressPercent}%"></div>
      </div>
      <div class="goal-stats-row">
        <span>เหลืออีก <strong>${formatBaht(feasibility.remainingAmount)}</strong></span>
        <span>เหลือเวลา <strong>${feasibility.daysRemaining} วัน</strong> (${feasibility.weeksRemaining} สัปดาห์)</span>
      </div>
    </article>

    <!-- สรุปเดือนนี้ -->
    <article class="card">
      <div class="card-header">
        <h2 class="card-title">📅 สรุปเดือน ${formatThaiMonthYear(monthRange.monthKey)}</h2>
      </div>
      <div class="kpi-grid">
        <div class="kpi-box income">
          <div class="kpi-label">รายรับรวม</div>
          <div class="kpi-value">${formatBaht(monthIncome)}</div>
        </div>
        <div class="kpi-box expense">
          <div class="kpi-label">รายจ่ายรวม</div>
          <div class="kpi-value">${formatBaht(monthExpense)}</div>
        </div>
        <div class="kpi-box goal">
          <div class="kpi-label">คงเหลือ (หลังออม)</div>
          <div class="kpi-value">${formatBaht(monthBalance)}</div>
        </div>
        <div class="kpi-box highlight">
          <div class="kpi-label">อัตราการออม</div>
          <div class="kpi-value">${savingRate}%</div>
        </div>
      </div>
    </article>

    <!-- กราฟคู่: สัดส่วนรายจ่าย + เงินเก็บสะสมเทียบแผน -->
    <div class="grid-2">
      <article class="card">
        <div class="card-header">
          <h2 class="card-title">🍩 สัดส่วนรายจ่ายเดือนนี้</h2>
        </div>
        ${monthExpense > 0
          ? `<div class="chart-container"><canvas id="chart-dash-pie"></canvas></div>`
          : `<div class="empty-state"><div class="empty-emoji">🌱</div>ยังไม่มีรายจ่ายในเดือนนี้ เริ่มบันทึกด้วยปุ่ม + ได้เลย</div>`
        }
      </article>

      <article class="card">
        <div class="card-header">
          <h2 class="card-title">📈 เงินเก็บสะสมเทียบเส้นแผน</h2>
        </div>
        <div class="chart-container"><canvas id="chart-dash-savings"></canvas></div>
      </article>
    </div>

    <!-- รายการล่าสุด 5 รายการ -->
    <article class="card">
      <div class="card-header">
        <h2 class="card-title">🧾 รายการล่าสุด 5 รายการ</h2>
        <button class="btn btn-soft btn-sm" id="dash-see-all-btn" type="button">ดูทั้งหมด</button>
      </div>
      ${latest5.length
        ? `<div class="tx-list">${latest5.map((t) => renderTransactionRow(t, catMap)).join('')}</div>`
        : `<div class="empty-state"><div class="empty-emoji">🍃</div>ยังไม่มีรายการเลย ลองกดปุ่ม <strong>+</strong> ด้านล่างเพื่อบันทึกรายการแรกนะ</div>`
      }
    </article>
  `;

  // ผูกปุ่มบนหน้า Dashboard
  document.getElementById('btn-toggle-formula').addEventListener('click', () => {
    uiState.showFormula = !uiState.showFormula;
    renderDashboard();
  });

  document.getElementById('dash-quick-save-btn').addEventListener('click', () => {
    openTransactionSheet({ presetType: 'savings' });
  });

  document.getElementById('dash-see-all-btn').addEventListener('click', () => switchView('transactions'));

  container.querySelectorAll('[data-pay-bill]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tx = await store.markMonthlyBillPaid(btn.dataset.payBill);
      if (tx) {
        showToast(`บันทึกจ่าย ${tx.note} แล้ว 🌿`, async () => {
          await store.deleteTransaction(tx.id);
        });
      }
    });
  });

  bindTransactionRowClicks(container);

  // วาดกราฟบน Dashboard
  if (monthExpense > 0) {
    drawCategoryDoughnut('chart-dash-pie', monthTx, categories);
  }
  drawSavingsVsPlanChart('chart-dash-savings', todayIso, goal, transactions);
}

// ---------------------------------------------------------
// 4.2 หน้ารายการทั้งหมด (ค้นหา + กรอง + แก้ไข/ลบ)
// ---------------------------------------------------------
function renderTransactionsView() {
  const container = document.getElementById('view-transactions');
  const { transactions, categories } = store.state;
  const todayIso = getTodayBangkok();
  const f = uiState.txFilter;

  const filtered = filterTransactions(transactions, categories, f, todayIso);
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));

  const totalIn = filtered.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = filtered.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const totalSav = filtered.filter((t) => t.type === 'savings').reduce((s, t) => s + Number(t.amount), 0);

  container.innerHTML = `
    <article class="card">
      <div class="filter-bar">
        <input id="filter-search" class="input" type="search" placeholder="🔍 ค้นหาโน้ตหรือชื่อหมวด..." value="${escapeHtml(f.search)}" />
        <select id="filter-period" class="select" aria-label="ช่วงเวลา">
          <option value="week" ${f.period === 'week' ? 'selected' : ''}>สัปดาห์นี้</option>
          <option value="month" ${f.period === 'month' ? 'selected' : ''}>เดือนนี้</option>
          <option value="all" ${f.period === 'all' ? 'selected' : ''}>ทั้งหมด</option>
          <option value="custom" ${f.period === 'custom' ? 'selected' : ''}>กำหนดช่วงวันที่</option>
        </select>
        <select id="filter-type" class="select" aria-label="ประเภท">
          <option value="all" ${f.type === 'all' ? 'selected' : ''}>ทุกประเภท</option>
          <option value="expense" ${f.type === 'expense' ? 'selected' : ''}>รายจ่าย</option>
          <option value="income" ${f.type === 'income' ? 'selected' : ''}>รายรับ</option>
          <option value="savings" ${f.type === 'savings' ? 'selected' : ''}>ออมเข้าเป้า</option>
        </select>
        <select id="filter-cat" class="select" aria-label="หมวดหมู่">
          <option value="all" ${f.categoryId === 'all' ? 'selected' : ''}>ทุกหมวดหมู่</option>
          ${categories.map((c) => `
            <option value="${escapeHtml(c.id)}" ${f.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.icon)} ${escapeHtml(c.name)}</option>
          `).join('')}
        </select>
      </div>

      ${f.period === 'custom' ? `
        <div class="form-row-2" style="margin-top:10px;">
          <div>
            <label class="form-label" for="filter-start">ตั้งแต่วันที่</label>
            <input id="filter-start" class="input" type="date" value="${escapeHtml(f.customStart || getMonthRange(todayIso).start)}" />
          </div>
          <div>
            <label class="form-label" for="filter-end">ถึงวันที่</label>
            <input id="filter-end" class="input" type="date" value="${escapeHtml(f.customEnd || todayIso)}" />
          </div>
        </div>
      ` : ''}

      <div class="goal-stats-row" style="margin-top:12px;">
        <span>พบ <strong>${filtered.length}</strong> รายการ</span>
        <span>รับ <strong>${formatBaht(totalIn)}</strong> • จ่าย <strong>${formatBaht(totalOut)}</strong> • ออม <strong>${formatBaht(totalSav)}</strong></span>
      </div>

      <div class="quick-actions">
        <button id="qa-income" class="btn btn-soft btn-sm" type="button">+ รายรับ</button>
        <button id="qa-expense" class="btn btn-peach btn-sm" type="button">+ รายจ่าย</button>
        <button id="qa-savings" class="btn btn-goal btn-sm" type="button">+ ออมเข้าเป้า</button>
        ${filtered.length ? `<button id="qa-delete-all" class="btn btn-sm btn-danger-soft" type="button">🗑️ ลบทั้งหมดที่แสดง (${filtered.length})</button>` : ''}
      </div>
    </article>

    <article class="card">
      ${filtered.length
        ? `<div class="tx-list">${filtered.map((t) => renderTransactionRow(t, catMap)).join('')}</div>`
        : `<div class="empty-state"><div class="empty-emoji">🔍</div>ไม่พบรายการที่ตรงกับเงื่อนไข ลองปรับตัวกรองดูนะ</div>`
      }
    </article>
  `;

  document.getElementById('filter-search').addEventListener('input', (e) => {
    uiState.txFilter.search = e.target.value;
    renderTransactionsView();
  });
  document.getElementById('filter-period').addEventListener('change', (e) => {
    uiState.txFilter.period = e.target.value;
    renderTransactionsView();
  });
  document.getElementById('filter-type').addEventListener('change', (e) => {
    uiState.txFilter.type = e.target.value;
    renderTransactionsView();
  });
  document.getElementById('filter-cat').addEventListener('change', (e) => {
    uiState.txFilter.categoryId = e.target.value;
    renderTransactionsView();
  });
  const startEl = document.getElementById('filter-start');
  const endEl = document.getElementById('filter-end');
  if (startEl) startEl.addEventListener('change', (e) => { uiState.txFilter.customStart = e.target.value; renderTransactionsView(); });
  if (endEl) endEl.addEventListener('change', (e) => { uiState.txFilter.customEnd = e.target.value; renderTransactionsView(); });

  document.getElementById('qa-income').addEventListener('click', () => openTransactionSheet({ presetType: 'income' }));
  document.getElementById('qa-expense').addEventListener('click', () => openTransactionSheet({ presetType: 'expense' }));
  document.getElementById('qa-savings').addEventListener('click', () => openTransactionSheet({ presetType: 'savings' }));

  const delAllBtn = document.getElementById('qa-delete-all');
  if (delAllBtn) {
    delAllBtn.addEventListener('click', async () => {
      const ids = filtered.map((t) => t.id);
      if (!window.confirm(`ลบ ${ids.length} รายการที่แสดงอยู่ทั้งหมด?\n(ย้อนกลับไม่ได้ — ถ้าไม่แน่ใจให้กรองเดือน/ประเภทก่อน)`)) return;
      delAllBtn.disabled = true;
      delAllBtn.textContent = 'กำลังลบ...';
      for (const id of ids) {
        await store.deleteTransaction(id);
      }
      showToast(`ลบ ${ids.length} รายการแล้ว`);
    });
  }

  bindTransactionRowClicks(container);
}

function filterTransactions(transactions, categories, f, todayIso) {
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name || '']));
  const week = getMondayWeekRange(todayIso);
  const month = getMonthRange(todayIso);
  const kw = (f.search || '').trim().toLowerCase();

  return transactions.filter((t) => {
    if (f.type !== 'all' && t.type !== f.type) return false;
    if (f.categoryId !== 'all' && t.categoryId !== f.categoryId) return false;
    if (f.period === 'week' && (t.date < week.start || t.date > week.end)) return false;
    if (f.period === 'month' && (t.date < month.start || t.date > month.end)) return false;
    if (f.period === 'custom') {
      const s = f.customStart || month.start;
      const e = f.customEnd || todayIso;
      if (t.date < s || t.date > e) return false;
    }
    if (kw) {
      const hay = `${t.note || ''} ${catMap[t.categoryId] || ''}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------
// 4.3 หน้าเป้าหมายโน้ตบุ๊ก (ละเอียดที่สุด)
// ---------------------------------------------------------
function renderGoalView() {
  const container = document.getElementById('view-goal');
  const { goal, transactions, recurring, settings, wishlist, categories } = store.state;
  const todayIso = getTodayBangkok();

  const actualEst = estimateActualSpending({ transactions, categories, settings });
  const baseFeas = calculateGoalFeasibility({
    todayIso,
    goal,
    transactions,
    recurring,
    settings,
    overrides: {
      monthlyShopee: actualEst.avgMonthlyShopee,
      weeklyFood: actualEst.avgWeeklyFood
    }
  });

  const whatIfFeas = calculateGoalFeasibility({
    todayIso,
    goal,
    transactions,
    recurring,
    settings,
    overrides: uiState.whatIf
  });

  // เปรียบเทียบวันซื้อของ What-if กับค่าปัจจุบัน
  let whatIfDiffBadge = 'ยังไม่เปลี่ยนจากแผนปัจจุบัน';
  if (baseFeas.estimatedDate && whatIfFeas.estimatedDate) {
    const savedDays = Math.round(
      (new Date(baseFeas.estimatedDate) - new Date(whatIfFeas.estimatedDate)) / 86400000
    );
    if (savedDays > 0) {
      whatIfDiffBadge = `✨ เร็วขึ้น ${savedDays} วัน (ได้ประมาณ ${formatThaiDate(whatIfFeas.estimatedDate)})`;
    } else if (savedDays < 0) {
      whatIfDiffBadge = `🍃 เลื่อนออกไป ${Math.abs(savedDays)} วัน (ได้ประมาณ ${formatThaiDate(whatIfFeas.estimatedDate)})`;
    } else {
      whatIfDiffBadge = `📅 คาดว่าจะได้ประมาณ ${formatThaiDate(whatIfFeas.estimatedDate)}`;
    }
  } else if (whatIfFeas.estimatedDate) {
    whatIfDiffBadge = `✨ ทำได้จริงแล้ว! คาดว่าจะได้ประมาณ ${formatThaiDate(whatIfFeas.estimatedDate)}`;
  }

  const weeklyPlan = buildWeeklySavingsPlan({ todayIso, goal, transactions });
  const savingsHistory = transactions.filter((t) => t.type === 'savings');
  const milestones = [10, 25, 50, 75, 100];

  container.innerHTML = `
    <!-- 1. ความคืบหน้า & ปุ่มออมเร็ว + Milestones -->
    <article class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">💻 ${escapeHtml(goal.name)}</h2>
          <p class="card-subtitle">กำหนดเสร็จ ${formatThaiDate(goal.targetDate)} • เหลือ ${baseFeas.daysRemaining} วัน (${baseFeas.weeksRemaining} สัปดาห์)</p>
        </div>
        <button id="goal-quick-save-btn" class="btn btn-primary" type="button">+ ออมเข้าเป้าหมาย</button>
      </div>

      <div class="goal-stats-row">
        <span>สะสมได้ <strong>${formatBaht(baseFeas.totalSaved)}</strong> / <strong>${formatBaht(baseFeas.targetAmount)}</strong></span>
        <strong>${baseFeas.progressPercent}%</strong>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${baseFeas.progressPercent}%"></div>
      </div>

      <div class="milestones-row" aria-label="จุดแวะพัก Milestones">
        ${milestones.map((m) => {
          const reached = baseFeas.progressPercent >= m;
          return `
            <div class="milestone-chip ${reached ? 'reached' : ''}">
              <div>${reached ? '🎉' : '🌱'}</div>
              <div>${m}%</div>
            </div>
          `;
        }).join('')}
      </div>
    </article>

    <!-- 2. ตั้งค่าเป้าหมาย (สไลเดอร์ 25,000–35,000 ปรับได้) -->
    <article class="card">
      <div class="card-header">
        <h2 class="card-title">🎯 ปรับรายละเอียดเป้าหมาย</h2>
      </div>
      <form id="goal-settings-form">
        <div class="form-group">
          <label class="form-label" for="goal-name">ชื่อเป้าหมาย</label>
          <input id="goal-name" class="input" type="text" value="${escapeHtml(goal.name)}" required />
        </div>

        <div class="range-wrap">
          <div class="range-header">
            <label for="goal-budget-slider"><strong>งบโน้ตบุ๊ก (25,000–35,000 บาท)</strong></label>
            <strong id="goal-budget-display">${formatBaht(goal.targetAmount)}</strong>
          </div>
          <input id="goal-budget-slider" type="range" min="25000" max="35000" step="500" value="${Math.min(35000, Math.max(25000, Number(goal.targetAmount) || 30000))}" />
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label" for="goal-target-amount">หรือระบุงบเอง (บาท)</label>
            <input id="goal-target-amount" class="input" type="number" min="1000" step="100" value="${Number(goal.targetAmount) || 30000}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="goal-target-date">วันที่อยากได้</label>
            <input id="goal-target-date" class="input" type="date" value="${escapeHtml(goal.targetDate || '2027-02-28')}" required />
          </div>
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label" for="goal-initial-savings">เงินเก็บตั้งต้น (บาท)</label>
            <input id="goal-initial-savings" class="input" type="number" min="0" step="100" value="${Number(goal.initialSavings) || 0}" required />
          </div>
          <div class="form-group" style="display:flex;align-items:flex-end;">
            <button type="submit" class="btn btn-primary btn-full">บันทึกเป้าหมาย</button>
          </div>
        </div>
      </form>
    </article>

    <!-- 3. เครื่องคำนวณความเป็นไปได้ & ตัวจำลอง What-if -->
    <div class="grid-2">
      <article class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">🧭 เครื่องคำนวณความเป็นไปได้</h2>
            <p class="card-subtitle">${actualEst.usingActualData ? 'อ้างอิงจากรายจ่ายจริงที่คุณบันทึกไว้' : 'อ้างอิงจากค่าเริ่มต้น (จะปรับตามจริงเมื่อเริ่มบันทึก)'}</p>
          </div>
        </div>

        <div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:12px;">
          <div class="kpi-box goal">
            <div class="kpi-label">ต้องเก็บเพื่อให้ทัน</div>
            <div class="kpi-value">${formatBaht(baseFeas.requiredPerWeek)}<span style="font-size:12px;font-weight:500;">/สัปดาห์</span></div>
            <div class="tx-sub">${formatBaht(baseFeas.requiredPerMonth)}/เดือน</div>
          </div>
          <div class="kpi-box income">
            <div class="kpi-label">เก็บได้จริงโดยประมาณ</div>
            <div class="kpi-value">${formatBaht(Math.max(0, baseFeas.realisticPerWeek))}<span style="font-size:12px;font-weight:500;">/สัปดาห์</span></div>
            <div class="tx-sub">${formatBaht(Math.max(0, baseFeas.realisticPerMonth))}/เดือน</div>
          </div>
        </div>

        <p style="margin:0 0 10px;">${escapeHtml(baseFeas.summaryText)}</p>
        ${baseFeas.suggestions.length ? `
          <div class="info-banner" style="margin-bottom:0;">
            <strong>ทางเลือกแบบสบายใจ:</strong>
            <ul style="margin:6px 0 0 18px;padding:0;">
              ${baseFeas.suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </article>

      <article class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">🎛️ ตัวจำลอง What-if</h2>
            <p class="card-subtitle">ลองเลื่อนปรับดูผลทันทีว่าวันที่ได้โน้ตบุ๊กขยับเร็วขึ้นกี่วัน</p>
          </div>
        </div>

        <div class="range-wrap">
          <div class="range-header">
            <label for="wi-shopee">Shopee ต่อเดือน</label>
            <strong id="wi-shopee-val">${formatBaht(uiState.whatIf.monthlyShopee)}</strong>
          </div>
          <input id="wi-shopee" type="range" min="0" max="3500" step="100" value="${uiState.whatIf.monthlyShopee}" />
        </div>

        <div class="range-wrap">
          <div class="range-header">
            <label for="wi-ai">ค่า AI ต่อเดือน</label>
            <strong id="wi-ai-val">${formatBaht(uiState.whatIf.monthlyAi)}</strong>
          </div>
          <input id="wi-ai" type="range" min="0" max="2000" step="50" value="${uiState.whatIf.monthlyAi}" />
        </div>

        <div class="range-wrap">
          <div class="range-header">
            <label for="wi-food">ค่ากินต่อสัปดาห์</label>
            <strong id="wi-food-val">${formatBaht(uiState.whatIf.weeklyFood)}</strong>
          </div>
          <input id="wi-food" type="range" min="300" max="2000" step="50" value="${uiState.whatIf.weeklyFood}" />
        </div>

        <div class="kpi-box highlight" id="wi-result-box">
          <div class="kpi-label">ผลจำลองทันที</div>
          <div style="font-weight:700;margin-top:4px;">${escapeHtml(whatIfDiffBadge)}</div>
          <div class="tx-sub" style="margin-top:4px;">
            ออมได้ราว ${formatBaht(Math.max(0, whatIfFeas.realisticPerWeek))}/สัปดาห์ (${formatBaht(Math.max(0, whatIfFeas.realisticPerMonth))}/เดือน)
          </div>
        </div>
      </article>
    </div>

    <!-- 4. กราฟเงินเก็บสะสมจริงเทียบเส้นแผน -->
    <article class="card">
      <div class="card-header">
        <h2 class="card-title">📈 กราฟเงินเก็บสะสมจริง เทียบกับเส้นแผน</h2>
      </div>
      <div class="chart-container"><canvas id="chart-goal-savings"></canvas></div>
    </article>

    <!-- 5. ลิสต์รุ่นโน้ตบุ๊กที่สนใจ (Wishlist) -->
    <article class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">🛍️ รุ่นโน้ตบุ๊กที่สนใจ (เทียบราคาในหน้าเดียว)</h2>
          <p class="card-subtitle">กด "ตั้งเป็นเป้าหมายหลัก" เพื่ออัปเดตราคาเป้าหมายอัตโนมัติ</p>
        </div>
        <button id="btn-add-wishlist" class="btn btn-soft btn-sm" type="button">+ เพิ่มรุ่นที่สนใจ</button>
      </div>

      ${wishlist.length ? `
        <div class="wishlist-grid">
          ${wishlist.map((w) => {
            const isSelected = goal.selectedWishlistId === w.id;
            return `
              <div class="wish-card ${isSelected ? 'selected' : ''}">
                <div class="card-header" style="margin-bottom:6px;">
                  <strong>${escapeHtml(w.name)}</strong>
                  <strong>${formatBaht(w.price)}</strong>
                </div>
                ${w.specs ? `<div class="tx-sub">สเปก: ${escapeHtml(w.specs)}</div>` : ''}
                ${w.note ? `<div class="tx-sub">โน้ต: ${escapeHtml(w.note)}</div>` : ''}
                ${w.link ? `<div class="tx-sub" style="margin-top:4px;"><a href="${escapeHtml(w.link)}" target="_blank" rel="noopener noreferrer">🔗 เปิดลิงก์สินค้า</a></div>` : ''}
                <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
                  <button class="btn ${isSelected ? 'btn-primary' : 'btn-goal'} btn-sm" data-select-wish="${escapeHtml(w.id)}" type="button">
                    ${isSelected ? '✓ เป้าหมายหลักอยู่ตอนนี้' : 'ตั้งเป็นเป้าหมายหลัก'}
                  </button>
                  <button class="btn btn-soft btn-sm" data-edit-wish="${escapeHtml(w.id)}" type="button">แก้ไข</button>
                  <button class="btn btn-peach btn-sm" data-del-wish="${escapeHtml(w.id)}" type="button">ลบ</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div class="empty-state">
          <div class="empty-emoji">💻</div>
          ยังไม่มีรุ่นโน้ตบุ๊กในลิสต์ ลองเพิ่มรุ่นที่เล็งไว้เพื่อเทียบราคาและสเปกในหน้าเดียวได้เลย
        </div>
      `}
    </article>

    <!-- 6. ตารางแผนรายสัปดาห์ถึงวันกำหนด -->
    <article class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">📋 ตารางแผนออมรายสัปดาห์ (${weeklyPlan.length} สัปดาห์)</h2>
          <p class="card-subtitle">เริ่มสัปดาห์ทุกวันจันทร์ จนถึง ${formatThaiDate(goal.targetDate)}</p>
        </div>
      </div>
      <div class="table-wrap" style="max-height:340px;overflow-y:auto;">
        <table>
          <thead>
            <tr>
              <th>สัปดาห์ที่</th>
              <th>ช่วงวันที่</th>
              <th>เป้าสัปดาห์นี้</th>
              <th>เก็บจริง</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            ${weeklyPlan.map((w) => `
              <tr class="${w.isCurrentWeek ? 'current-week-row' : ''}">
                <td>#${w.weekNumber}</td>
                <td>${formatThaiDate(w.weekStart)} – ${formatThaiDate(w.weekEnd)}</td>
                <td>${formatBaht(w.targetThisWeek)}</td>
                <td><strong>${formatBaht(w.actualThisWeek)}</strong></td>
                <td><span class="badge ${w.status === 'reached' ? 'badge-paid' : w.isCurrentWeek ? 'badge-goal' : 'badge-pending'}">${escapeHtml(w.statusLabel)}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </article>

    <!-- 7. ประวัติการออมเข้าเป้าหมาย -->
    <article class="card">
      <div class="card-header">
        <h2 class="card-title">🌱 ประวัติการออมเข้าเป้าหมาย</h2>
      </div>
      ${savingsHistory.length
        ? `<div class="tx-list">${savingsHistory.map((t) => renderTransactionRow(t, Object.fromEntries(categories.map((c) => [c.id, c])))).join('')}</div>`
        : `<div class="empty-state"><div class="empty-emoji">🪙</div>ยังไม่มีประวัติการออม ลองออมก้อนแรกด้วยปุ่ม "+ ออมเข้าเป้าหมาย" ด้านบนนะ</div>`
      }
    </article>
  `;

  // ผูกเหตุการณ์หน้าเป้าหมาย
  document.getElementById('goal-quick-save-btn').addEventListener('click', () => {
    openTransactionSheet({ presetType: 'savings' });
  });

  const slider = document.getElementById('goal-budget-slider');
  const amountInput = document.getElementById('goal-target-amount');
  const display = document.getElementById('goal-budget-display');
  slider.addEventListener('input', () => {
    amountInput.value = slider.value;
    display.textContent = formatBaht(slider.value);
  });
  amountInput.addEventListener('input', () => {
    const val = Number(amountInput.value) || 0;
    display.textContent = formatBaht(val);
    if (val >= 25000 && val <= 35000) slider.value = val;
  });

  document.getElementById('goal-settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('goal-name').value.trim();
    const targetAmount = Number(amountInput.value);
    const targetDate = document.getElementById('goal-target-date').value;
    const initialSavings = Number(document.getElementById('goal-initial-savings').value);
    if (!name || !Number.isFinite(targetAmount) || targetAmount <= 0 || !targetDate || initialSavings < 0) {
      showToast('กรุณากรอกข้อมูลเป้าหมายให้ครบและเป็นตัวเลขที่ถูกต้องนะ');
      return;
    }
    await store.saveGoal({ name, targetAmount, targetDate, initialSavings });
    showToast('อัปเดตเป้าหมายโน้ตบุ๊กเรียบร้อยแล้ว 💻');
  });

  // ตัวจำลอง What-if แบบเรียลไทม์
  const updateWhatIf = () => {
    uiState.whatIf.monthlyShopee = Number(document.getElementById('wi-shopee').value);
    uiState.whatIf.monthlyAi = Number(document.getElementById('wi-ai').value);
    uiState.whatIf.weeklyFood = Number(document.getElementById('wi-food').value);
    document.getElementById('wi-shopee-val').textContent = formatBaht(uiState.whatIf.monthlyShopee);
    document.getElementById('wi-ai-val').textContent = formatBaht(uiState.whatIf.monthlyAi);
    document.getElementById('wi-food-val').textContent = formatBaht(uiState.whatIf.weeklyFood);

    const sim = calculateGoalFeasibility({
      todayIso, goal, transactions, recurring, settings, overrides: uiState.whatIf
    });
    let msg = 'ลองปรับลดรายจ่ายอีกนิดเพื่อให้มีเงินออมคงเหลือนะ 🌿';
    if (baseFeas.estimatedDate && sim.estimatedDate) {
      const savedDays = Math.round((new Date(baseFeas.estimatedDate) - new Date(sim.estimatedDate)) / 86400000);
      if (savedDays > 0) msg = `✨ เร็วขึ้น ${savedDays} วัน (ได้ประมาณ ${formatThaiDate(sim.estimatedDate)})`;
      else if (savedDays < 0) msg = `🍃 เลื่อนออกไป ${Math.abs(savedDays)} วัน (ได้ประมาณ ${formatThaiDate(sim.estimatedDate)})`;
      else msg = `📅 คาดว่าจะได้ประมาณ ${formatThaiDate(sim.estimatedDate)}`;
    } else if (sim.estimatedDate) {
      msg = `✨ ทำได้จริงแล้ว! คาดว่าจะได้ประมาณ ${formatThaiDate(sim.estimatedDate)}`;
    }

    document.getElementById('wi-result-box').innerHTML = `
      <div class="kpi-label">ผลจำลองทันที</div>
      <div style="font-weight:700;margin-top:4px;">${escapeHtml(msg)}</div>
      <div class="tx-sub" style="margin-top:4px;">ออมได้ราว ${formatBaht(Math.max(0, sim.realisticPerWeek))}/สัปดาห์ (${formatBaht(Math.max(0, sim.realisticPerMonth))}/เดือน)</div>
    `;
  };
  ['wi-shopee', 'wi-ai', 'wi-food'].forEach((id) => {
    document.getElementById(id).addEventListener('input', updateWhatIf);
  });

  // Wishlist Actions
  document.getElementById('btn-add-wishlist').addEventListener('click', () => openWishlistModal());
  container.querySelectorAll('[data-select-wish]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = wishlist.find((w) => w.id === btn.dataset.selectWish);
      if (!item) return;
      await store.saveGoal({
        name: item.name,
        targetAmount: Number(item.price),
        selectedWishlistId: item.id
      });
      showToast(`ตั้ง "${item.name}" (${formatBaht(item.price)}) เป็นเป้าหมายหลักแล้ว 💻`);
    });
  });
  container.querySelectorAll('[data-edit-wish]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = wishlist.find((w) => w.id === btn.dataset.editWish);
      if (item) openWishlistModal(item);
    });
  });
  container.querySelectorAll('[data-del-wish]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await store.deleteWishlistItem(btn.dataset.delWish);
      showToast('ลบออกจากลิสต์ที่สนใจแล้ว');
    });
  });

  bindTransactionRowClicks(container);
  drawSavingsVsPlanChart('chart-goal-savings', todayIso, goal, transactions);
}

// ---------------------------------------------------------
// 4.4 หน้ารายงานและกราฟ
// ---------------------------------------------------------
function renderReportsView() {
  const container = document.getElementById('view-reports');
  const { transactions, categories, goal } = store.state;
  const todayIso = getTodayBangkok();
  const week = getMondayWeekRange(todayIso);
  const month = getMonthRange(todayIso);
  const prevMonthKey = getPreviousMonthKey(month.monthKey);

  // รายการตามช่วงเวลาที่เลือกสำหรับกราฟวงกลม
  const periodTx = transactions.filter((t) => {
    if (uiState.reportPeriod === 'week') return t.date >= week.start && t.date <= week.end;
    if (uiState.reportPeriod === 'month') return t.date >= month.start && t.date <= month.end;
    return true;
  });

  // สรุปสิ้นเดือน (เดือนนี้ vs เดือนก่อน)
  const curMonthTx = transactions.filter((t) => String(t.date || '').startsWith(month.monthKey));
  const prevMonthTx = transactions.filter((t) => String(t.date || '').startsWith(prevMonthKey));

  const curIn = curMonthTx.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const curOut = curMonthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const curSaved = Math.max(0, curIn - curOut);
  const curRate = curIn > 0 ? Math.round((curSaved / curIn) * 100) : 0;

  const prevIn = prevMonthTx.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const prevOut = prevMonthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const prevSaved = Math.max(0, prevIn - prevOut);

  const savedDiff = curSaved - prevSaved;
  const savedDiffPct = prevSaved > 0 ? Math.round((savedDiff / prevSaved) * 100) : null;

  // หมวดที่ใช้มากที่สุดในเดือนนี้
  const catTotals = {};
  for (const t of curMonthTx.filter((x) => x.type === 'expense')) {
    catTotals[t.categoryId] = (catTotals[t.categoryId] || 0) + Number(t.amount);
  }
  const topCatEntry = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  const topCat = topCatEntry ? categories.find((c) => c.id === topCatEntry[0]) : null;

  // ข้อความสรุปสั้น ๆ แบบเป็นมิตร 2-3 ประโยค
  let friendlySummary = `เดือน${formatThaiMonthYear(month.monthKey)} นี้คุณมีรายรับรวม ${formatBaht(curIn)} และรายจ่ายรวม ${formatBaht(curOut)} `;
  if (prevIn === 0 && prevOut === 0) {
    friendlySummary += `เก็บเงินส่วนต่างได้ ${formatBaht(curSaved)} (อัตราการออม ${curRate}%) เป็นการเริ่มต้นที่ดีมากเลยนะ 🌿`;
  } else if (savedDiff >= 0) {
    friendlySummary += `เดือนนี้เก็บได้เพิ่มจากเดือนก่อน ${formatBaht(savedDiff)}${savedDiffPct !== null ? ` (+${savedDiffPct}%)` : ''} เก่งมากเลย! ค่อย ๆ รักษาจังหวะนี้ไว้โน้ตบุ๊กใกล้เข้ามาทุกทีแล้ว ✨`;
  } else {
    friendlySummary += `เดือนนี้มีค่าใช้จ่ายมากกว่าเดือนก่อนนิดหน่อย ไม่เป็นไรเลยนะ ทุกเดือนมีจังหวะต่างกัน เดือนหน้าค่อยเริ่มเก็บกันใหม่แบบสบายใจ 🍃`;
  }

  const periodExpenseTotal = periodTx.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  container.innerHTML = `
    <!-- ข้อความสรุปที่เป็นมิตร -->
    <article class="card" style="background:linear-gradient(135deg,#ECF9F3,#FFFDF7);">
      <h2 class="card-title">💌 สรุปประจำเดือน ${formatThaiMonthYear(month.monthKey)}</h2>
      <p style="margin:8px 0 12px;">${escapeHtml(friendlySummary)}</p>

      <div class="kpi-grid">
        <div class="kpi-box income">
          <div class="kpi-label">รายรับรวม</div>
          <div class="kpi-value">${formatBaht(curIn)}</div>
        </div>
        <div class="kpi-box expense">
          <div class="kpi-label">รายจ่ายรวม</div>
          <div class="kpi-value">${formatBaht(curOut)}</div>
        </div>
        <div class="kpi-box goal">
          <div class="kpi-label">เก็บได้เดือนนี้</div>
          <div class="kpi-value">${formatBaht(curSaved)}</div>
          <div class="tx-sub">อัตราการออม ${curRate}%</div>
        </div>
        <div class="kpi-box highlight">
          <div class="kpi-label">หมวดที่ใช้มากสุด</div>
          <div class="kpi-value" style="font-size:16px;">${topCat ? `${escapeHtml(topCat.icon)} ${escapeHtml(topCat.name)}` : 'ยังไม่มีข้อมูล'}</div>
          <div class="tx-sub">${topCatEntry ? formatBaht(topCatEntry[1]) : '-'}</div>
        </div>
      </div>
    </article>

    <!-- ตัวเลือกช่วงเวลากราฟวงกลม -->
    <div class="grid-2">
      <article class="card">
        <div class="card-header">
          <h2 class="card-title">🍩 สัดส่วนรายจ่ายตามหมวด</h2>
          <select id="report-period-select" class="select" style="width:auto;min-width:120px;">
            <option value="week" ${uiState.reportPeriod === 'week' ? 'selected' : ''}>สัปดาห์นี้</option>
            <option value="month" ${uiState.reportPeriod === 'month' ? 'selected' : ''}>เดือนนี้</option>
            <option value="all" ${uiState.reportPeriod === 'all' ? 'selected' : ''}>ทั้งหมด</option>
          </select>
        </div>
        ${periodExpenseTotal > 0
          ? `<div class="chart-container"><canvas id="chart-rep-pie"></canvas></div>`
          : `<div class="empty-state"><div class="empty-emoji">🍩</div>ยังไม่มีรายจ่ายในช่วงเวลานี้</div>`
        }
      </article>

      <article class="card">
        <div class="card-header">
          <h2 class="card-title">📊 รายรับ vs รายจ่าย (8 สัปดาห์ล่าสุด)</h2>
        </div>
        <div class="chart-container"><canvas id="chart-rep-bar"></canvas></div>
      </article>
    </div>

    <article class="card">
      <div class="card-header">
        <h2 class="card-title">📈 กราฟเส้นเงินเก็บสะสม</h2>
      </div>
      <div class="chart-container"><canvas id="chart-rep-savings"></canvas></div>
    </article>
  `;

  document.getElementById('report-period-select').addEventListener('change', (e) => {
    uiState.reportPeriod = e.target.value;
    renderReportsView();
  });

  if (periodExpenseTotal > 0) drawCategoryDoughnut('chart-rep-pie', periodTx, categories);
  drawWeeklyBarChart('chart-rep-bar', todayIso, transactions);
  drawSavingsVsPlanChart('chart-rep-savings', todayIso, goal, transactions);
}

// ---------------------------------------------------------
// 4.5 หน้าตั้งค่า
// ---------------------------------------------------------
function renderSettingsView() {
  const container = document.getElementById('view-settings');
  const { recurring, categories, settings } = store.state;

  const weeklyRecurring = recurring.filter((r) => r.frequency === 'weekly');
  const monthlyRecurring = recurring.filter((r) => r.frequency === 'monthly');

  container.innerHTML = `
    <!-- 1. รายรับประจำสัปดาห์ -->
    <article class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">💵 รายรับประจำสัปดาห์ (อัตโนมัติ)</h2>
          <p class="card-subtitle">ระบบจะสร้างรายการให้อัตโนมัติทุกสัปดาห์ตามวันที่เลือก</p>
        </div>
        <button class="btn btn-soft btn-sm" id="btn-add-weekly" type="button">+ เพิ่มรายรับประจำ</button>
      </div>
      <div class="tx-list">
        ${weeklyRecurring.map((r) => `
          <div class="bill-row paid">
            <div>
              <strong>${escapeHtml(r.name)}</strong>
              <div class="tx-sub">${formatBaht(r.amount)} • ทุก${WEEKDAY_OPTIONS.find((w) => w.value === Number(r.dayOfWeek))?.label || 'วันจันทร์'}</div>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-soft btn-sm" data-edit-rec="${escapeHtml(r.id)}" type="button">แก้</button>
              <button class="btn btn-peach btn-sm" data-del-rec="${escapeHtml(r.id)}" type="button">ลบ</button>
            </div>
          </div>
        `).join('')}
      </div>
    </article>

    <!-- 2. รายจ่ายประจำรายเดือน -->
    <article class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">🗓️ รายจ่ายประจำรายเดือน</h2>
          <p class="card-subtitle">ขึ้นสถานะ "รอจ่าย" อัตโนมัติทุกเดือน พร้อมปุ่มติ๊กจ่ายแล้ว</p>
        </div>
        <button class="btn btn-soft btn-sm" id="btn-add-monthly" type="button">+ เพิ่มบิลประจำ</button>
      </div>
      <div class="tx-list">
        ${monthlyRecurring.map((r) => `
          <div class="bill-row">
            <div>
              <strong>${escapeHtml(r.name)}</strong>
              <div class="tx-sub">${formatBaht(r.amount)} • จ่ายทุกวันที่ ${r.dueDay || 1} ของเดือน</div>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-soft btn-sm" data-edit-rec="${escapeHtml(r.id)}" type="button">แก้</button>
              <button class="btn btn-peach btn-sm" data-del-rec="${escapeHtml(r.id)}" type="button">ลบ</button>
            </div>
          </div>
        `).join('')}
      </div>
    </article>

    <!-- 3. ค่ากันเงินสำหรับการคำนวณงบวันนี้ -->
    <article class="card">
      <div class="card-header">
        <h2 class="card-title">🧮 ค่าประมาณการสำหรับสูตรคำนวณงบวันนี้</h2>
      </div>
      <form id="settings-baseline-form">
        <div class="grid-3">
          <div class="form-group">
            <label class="form-label" for="set-shopee">กันงบ Shopee ต่อเดือน (บาท)</label>
            <input id="set-shopee" class="input" type="number" min="0" step="50" value="${Number(settings.monthlyShopeeReserve ?? 1750)}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="set-food">ค่ากินเฉลี่ยต่อสัปดาห์ (บาท)</label>
            <input id="set-food" class="input" type="number" min="0" step="50" value="${Number(settings.weeklyFoodEstimate ?? 950)}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="set-fuel">ค่าน้ำมันเฉลี่ยต่อสัปดาห์ (บาท)</label>
            <input id="set-fuel" class="input" type="number" min="0" step="50" value="${Number(settings.weeklyFuelEstimate ?? 300)}" required />
          </div>
        </div>
        <button type="submit" class="btn btn-primary">บันทึกค่าประมาณการ</button>
      </form>
    </article>

    <!-- 4. จัดการหมวดหมู่ -->
    <article class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">🏷️ จัดการหมวดหมู่</h2>
          <p class="card-subtitle">เพิ่ม แก้ไข หรือลบหมวด พร้อมเลือกไอคอนและสีพาสเทลได้เอง</p>
        </div>
        <button class="btn btn-soft btn-sm" id="btn-add-category" type="button">+ เพิ่มหมวด</button>
      </div>
      <div class="tx-list">
        ${categories.map((c) => `
          <div class="bill-row paid" style="background:#FFFDF9;">
            <div class="tx-left">
              <span class="tx-icon" style="background:${escapeHtml(c.color || '#A8E6CF')}">${escapeHtml(c.icon || '🌿')}</span>
              <div>
                <strong>${escapeHtml(c.name)}</strong>
                <div class="tx-sub">${c.type === 'income' ? 'รายรับ' : c.type === 'savings' ? 'ออมเข้าเป้า' : 'รายจ่าย'}</div>
              </div>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-soft btn-sm" data-edit-cat="${escapeHtml(c.id)}" type="button">แก้</button>
              ${c.id !== 'cat_savings' ? `<button class="btn btn-peach btn-sm" data-del-cat="${escapeHtml(c.id)}" type="button">ลบ</button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </article>

    <!-- 5. สำรองข้อมูล (Export / Import JSON & CSV) -->
    <article class="card">
      <div class="card-header">
        <h2 class="card-title">💾 สำรองและกู้คืนข้อมูล</h2>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;">
        <button id="btn-export-json" class="btn btn-soft" type="button">⬇️ ส่งออก JSON (ทั้งหมด)</button>
        <button id="btn-export-csv" class="btn btn-soft" type="button">⬇️ ส่งออก CSV (รายการ)</button>
        <label class="btn btn-goal" style="cursor:pointer;">
          ⬆️ นำเข้า JSON
          <input id="input-import-json" type="file" accept=".json,application/json" class="hidden" />
        </label>
        <label class="btn btn-goal" style="cursor:pointer;">
          ⬆️ นำเข้า CSV
          <input id="input-import-csv" type="file" accept=".csv,text/csv" class="hidden" />
        </label>
      </div>
    </article>

    <!-- 6. บัญชีผู้ใช้ & ลบข้อมูลทั้งหมด (ยืนยันสองชั้น) -->
    <article class="card">
      <div class="card-header">
        <h2 class="card-title">🔐 บัญชีและการล้างข้อมูล</h2>
      </div>
      <p class="card-subtitle" style="margin-bottom:12px;">
        ${store.user ? `เข้าสู่ระบบด้วย: <strong>${escapeHtml(store.user.email || store.user.displayName)}</strong>` : 'กำลังใช้งานในโหมดเก็บข้อมูลบนเครื่องนี้ (ยังไม่ได้เชื่อมต่อบัญชี Google)'}
      </p>
      <div style="display:flex;flex-wrap:wrap;gap:10px;">
        ${store.mode === 'firebase' && store.user
          ? `<button id="btn-signout" class="btn btn-soft" type="button">ออกจากระบบ</button>`
          : ''
        }
        <button id="btn-wipe-data" class="btn btn-peach" type="button">ล้างข้อมูลทั้งหมด (ยืนยัน 2 ชั้น)</button>
      </div>
    </article>
  `;

  // ผูกเหตุการณ์หน้าตั้งค่า
  document.getElementById('btn-add-weekly').addEventListener('click', () => openRecurringModal({ frequency: 'weekly', type: 'income' }));
  document.getElementById('btn-add-monthly').addEventListener('click', () => openRecurringModal({ frequency: 'monthly', type: 'expense' }));
  container.querySelectorAll('[data-edit-rec]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rec = recurring.find((r) => r.id === btn.dataset.editRec);
      if (rec) openRecurringModal(rec);
    });
  });
  container.querySelectorAll('[data-del-rec]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await store.deleteRecurring(btn.dataset.delRec);
      showToast('ลบรายการประจำแล้ว');
    });
  });

  document.getElementById('settings-baseline-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const monthlyShopeeReserve = Number(document.getElementById('set-shopee').value);
    const weeklyFoodEstimate = Number(document.getElementById('set-food').value);
    const weeklyFuelEstimate = Number(document.getElementById('set-fuel').value);
    if (monthlyShopeeReserve < 0 || weeklyFoodEstimate < 0 || weeklyFuelEstimate < 0) {
      showToast('กรุณากรอกจำนวนเงินที่ไม่ติดลบนะ');
      return;
    }
    await store.saveSettings({ monthlyShopeeReserve, weeklyFoodEstimate, weeklyFuelEstimate });
    uiState.whatIf.initialized = false;
    showToast('บันทึกค่าประมาณการเรียบร้อยแล้ว 🌿');
  });

  document.getElementById('btn-add-category').addEventListener('click', () => openCategoryModal());
  container.querySelectorAll('[data-edit-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = categories.find((c) => c.id === btn.dataset.editCat);
      if (cat) openCategoryModal(cat);
    });
  });
  container.querySelectorAll('[data-del-cat]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await store.deleteCategory(btn.dataset.delCat);
      showToast('ลบหมวดหมู่แล้ว');
    });
  });

  // Export / Import
  document.getElementById('btn-export-json').addEventListener('click', () => {
    downloadFile(store.exportJSON(), `mintcream-backup-${getTodayBangkok()}.json`, 'application/json');
    showToast('ดาวน์โหลดไฟล์สำรอง JSON แล้ว 💾');
  });

  document.getElementById('btn-export-csv').addEventListener('click', () => {
    const csv = transactionsToCSV(store.state.transactions, store.state.categories);
    downloadFile(csv, `mintcream-transactions-${getTodayBangkok()}.csv`, 'text/csv;charset=utf-8;');
    showToast('ดาวน์โหลดไฟล์ CSV แล้ว 📄');
  });

  document.getElementById('input-import-json').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await store.importJSON(text);
      showToast('นำเข้าข้อมูล JSON สำเร็จแล้ว 🌿');
    } catch (err) {
      showToast(`นำเข้า JSON ไม่สำเร็จ: ${err.message}`);
    }
    e.target.value = '';
  });

  document.getElementById('input-import-csv').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseTransactionsCSV(text, store.state.categories);
      if (!rows.length) {
        showToast('ไม่พบรายการที่ถูกต้องในไฟล์ CSV');
        return;
      }
      for (const row of rows) {
        await store.saveTransaction(row, { skipUsageIncrement: true });
      }
      showToast(`นำเข้า ${rows.length} รายการจาก CSV สำเร็จแล้ว 🌿`);
    } catch (err) {
      showToast(`นำเข้า CSV ไม่สำเร็จ: ${err.message}`);
    }
    e.target.value = '';
  });

  const signoutBtn = document.getElementById('btn-signout');
  if (signoutBtn) {
    signoutBtn.addEventListener('click', async () => {
      await store.signOut();
      showToast('ออกจากระบบเรียบร้อยแล้ว');
    });
  }

  document.getElementById('btn-wipe-data').addEventListener('click', openWipeConfirmModal);
}

// ---------------------------------------------------------
// แผ่นฟอร์มบันทึกรายการจากด้านล่าง (Quick-Add Bottom Sheet)
// ---------------------------------------------------------
function bindTransactionSheetEvents() {
  const backdrop = document.getElementById('tx-sheet-backdrop');
  const form = document.getElementById('tx-form');
  const amountInput = document.getElementById('tx-amount');

  document.getElementById('tx-sheet-close').addEventListener('click', closeTransactionSheet);
  backdrop.addEventListener('click', (e) => {
    if (e.target.id === 'tx-sheet-backdrop') closeTransactionSheet();
  });

  // สลับประเภทแบบ Segmented
  form.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      uiState.sheetType = btn.dataset.type;
      uiState.sheetCategoryId = null;
      updateSheetTypeUI();
    });
  });

  // ปุ่มจำนวนเงินลัด (+50, +100, +500)
  form.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const current = Number(amountInput.value) || 0;
      amountInput.value = current + Number(btn.dataset.add);
      amountInput.focus();
    });
  });

  document.getElementById('tx-clear-amount').addEventListener('click', () => {
    amountInput.value = '';
    amountInput.focus();
  });

  // บันทึกแล้วปิด
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleSaveTransaction({ keepOpen: false });
  });

  // บันทึกแล้วเพิ่มต่อ
  document.getElementById('tx-save-continue-btn').addEventListener('click', async () => {
    await handleSaveTransaction({ keepOpen: true });
  });

  // ลบรายการ (พร้อม Undo 5 วินาที)
  document.getElementById('tx-delete-btn').addEventListener('click', async () => {
    const id = document.getElementById('tx-id').value;
    if (!id) return;
    const removed = await store.deleteTransaction(id);
    closeTransactionSheet();
    if (removed) {
      showToast('ลบรายการแล้ว', async () => {
        await store.saveTransaction(removed, { skipUsageIncrement: true });
      });
    }
  });
}

function openTransactionSheet({ tx = null, presetType = 'expense' } = {}) {
  const backdrop = document.getElementById('tx-sheet-backdrop');
  const titleEl = document.getElementById('tx-sheet-title');
  const idEl = document.getElementById('tx-id');
  const amountEl = document.getElementById('tx-amount');
  const dateEl = document.getElementById('tx-date');
  const noteEl = document.getElementById('tx-note');
  const deleteBtn = document.getElementById('tx-delete-btn');
  const saveContinueBtn = document.getElementById('tx-save-continue-btn');
  const errorEl = document.getElementById('tx-error');

  errorEl.classList.add('hidden');

  if (tx) {
    titleEl.textContent = 'แก้ไขรายการ';
    idEl.value = tx.id;
    amountEl.value = tx.amount;
    dateEl.value = tx.date;
    noteEl.value = tx.note || '';
    uiState.sheetType = tx.type;
    uiState.sheetCategoryId = tx.categoryId;
    deleteBtn.classList.remove('hidden');
    saveContinueBtn.classList.add('hidden');
  } else {
    titleEl.textContent = 'บันทึกรายการใหม่';
    idEl.value = '';
    amountEl.value = '';
    dateEl.value = getTodayBangkok();
    noteEl.value = '';
    uiState.sheetType = presetType;
    uiState.sheetCategoryId = null;
    deleteBtn.classList.add('hidden');
    saveContinueBtn.classList.remove('hidden');
  }

  updateSheetTypeUI();
  backdrop.classList.remove('hidden');

  // โฟกัสช่องจำนวนเงินทันทีเพื่อเปิดแป้นตัวเลขบนมือถือ
  setTimeout(() => amountEl.focus(), 80);
}

function closeTransactionSheet() {
  document.getElementById('tx-sheet-backdrop').classList.add('hidden');
}

function updateSheetTypeUI() {
  const form = document.getElementById('tx-form');
  form.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.type === uiState.sheetType);
  });

  // เรียงหมวดที่ใช้บ่อยและใช้ล่าสุดมาไว้หน้าสุด
  const cats = store.state.categories
    .filter((c) => c.type === uiState.sheetType)
    .sort((a, b) => (Number(b.lastUsedAt) || 0) - (Number(a.lastUsedAt) || 0) || (Number(b.usageCount) || 0) - (Number(a.usageCount) || 0));

  if (!uiState.sheetCategoryId || !cats.some((c) => c.id === uiState.sheetCategoryId)) {
    uiState.sheetCategoryId = cats[0]?.id || null;
  }

  const grid = document.getElementById('tx-category-grid');
  grid.innerHTML = cats.map((c) => `
    <button type="button" class="cat-tile ${c.id === uiState.sheetCategoryId ? 'selected' : ''}" data-cat-pick="${escapeHtml(c.id)}">
      <span style="font-size:22px;">${escapeHtml(c.icon || '🌿')}</span>
      <span>${escapeHtml(c.name)}</span>
    </button>
  `).join('');

  grid.querySelectorAll('[data-cat-pick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      uiState.sheetCategoryId = btn.dataset.catPick;
      grid.querySelectorAll('.cat-tile').forEach((el) => el.classList.toggle('selected', el === btn));
    });
  });
}

async function handleSaveTransaction({ keepOpen }) {
  const id = document.getElementById('tx-id').value;
  const amountEl = document.getElementById('tx-amount');
  const dateEl = document.getElementById('tx-date');
  const noteEl = document.getElementById('tx-note');
  const errorEl = document.getElementById('tx-error');

  const amount = Number(amountEl.value);
  const date = dateEl.value;
  const note = noteEl.value.trim();

  // ตรวจความถูกต้องของข้อมูลทุกช่อง (ไม่ใช้สีแดงรุนแรง)
  if (!Number.isFinite(amount) || amount <= 0) {
    errorEl.textContent = 'กรุณากรอกจำนวนเงินที่มากกว่า 0 บาทนะ';
    errorEl.classList.remove('hidden');
    amountEl.focus();
    return;
  }
  if (!date) {
    errorEl.textContent = 'กรุณาเลือกวันที่ก่อนบันทึกนะ';
    errorEl.classList.remove('hidden');
    dateEl.focus();
    return;
  }
  if (!uiState.sheetCategoryId) {
    errorEl.textContent = 'กรุณาเลือกหมวดหมู่ก่อนบันทึกนะ';
    errorEl.classList.remove('hidden');
    return;
  }

  errorEl.classList.add('hidden');

  const saved = await store.saveTransaction({
    id: id || undefined,
    type: uiState.sheetType,
    amount,
    categoryId: uiState.sheetCategoryId,
    date,
    note
  });

  const label = uiState.sheetType === 'income' ? 'รายรับ' : uiState.sheetType === 'savings' ? 'เงินออมเข้าเป้า' : 'รายจ่าย';
  showToast(`บันทึก${label} ${formatBaht(saved.amount)} แล้ว 🌿`, !id ? async () => {
    await store.deleteTransaction(saved.id);
  } : null);

  if (keepOpen) {
    amountEl.value = '';
    noteEl.value = '';
    amountEl.focus();
  } else {
    closeTransactionSheet();
  }
}

// ---------------------------------------------------------
// โมดัลจัดการ หมวดหมู่ / บิลประจำ / Wishlist / ยืนยันลบสองชั้น
// ---------------------------------------------------------
function openModal(title, html) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-backdrop').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
}

function openCategoryModal(cat = null) {
  const selectedColor = cat?.color || PASTEL_COLORS[0];
  openModal(cat ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่ใหม่', `
    <form id="modal-cat-form">
      <div class="form-group">
        <label class="form-label" for="m-cat-name">ชื่อหมวด</label>
        <input id="m-cat-name" class="input" type="text" value="${escapeHtml(cat?.name || '')}" required />
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label class="form-label" for="m-cat-type">ประเภท</label>
          <select id="m-cat-type" class="select">
            <option value="expense" ${(cat?.type || 'expense') === 'expense' ? 'selected' : ''}>รายจ่าย</option>
            <option value="income" ${cat?.type === 'income' ? 'selected' : ''}>รายรับ</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="m-cat-icon">ไอคอน (อีโมจิ)</label>
          <input id="m-cat-icon" class="input" type="text" value="${escapeHtml(cat?.icon || '🌿')}" maxlength="4" required />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">สีพาสเทล</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;" id="m-color-picker">
          ${PASTEL_COLORS.map((col) => `
            <button type="button" data-col="${col}" style="width:36px;height:36px;border-radius:50%;background:${col};border:${col === selectedColor ? '3px solid #2F4F46' : '1px solid #DCEEE6'};cursor:pointer;" aria-label="เลือกสี ${col}"></button>
          `).join('')}
        </div>
        <input type="hidden" id="m-cat-color" value="${escapeHtml(selectedColor)}" />
      </div>
      <button type="submit" class="btn btn-primary btn-full">บันทึกหมวดหมู่</button>
    </form>
  `);

  document.querySelectorAll('#m-color-picker [data-col]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('m-cat-color').value = btn.dataset.col;
      document.querySelectorAll('#m-color-picker [data-col]').forEach((b) => {
        b.style.border = b === btn ? '3px solid #2F4F46' : '1px solid #DCEEE6';
      });
    });
  });

  document.getElementById('modal-cat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('m-cat-name').value.trim();
    if (!name) return;
    await store.saveCategory({
      ...(cat || {}),
      name,
      type: document.getElementById('m-cat-type').value,
      icon: document.getElementById('m-cat-icon').value.trim() || '🌿',
      color: document.getElementById('m-cat-color').value
    });
    closeModal();
    showToast('บันทึกหมวดหมู่เรียบร้อยแล้ว 🌿');
  });
}

function openRecurringModal(rec = {}) {
  const isWeekly = rec.frequency === 'weekly';
  const cats = store.state.categories.filter((c) => c.type === (rec.type || (isWeekly ? 'income' : 'expense')));

  openModal(rec.id ? 'แก้ไขรายการประจำ' : isWeekly ? 'เพิ่มรายรับประจำสัปดาห์' : 'เพิ่มรายจ่ายประจำรายเดือน', `
    <form id="modal-rec-form">
      <div class="form-group">
        <label class="form-label" for="m-rec-name">ชื่อรายการ</label>
        <input id="m-rec-name" class="input" type="text" value="${escapeHtml(rec.name || '')}" required />
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label class="form-label" for="m-rec-amount">จำนวนเงิน (บาท)</label>
          <input id="m-rec-amount" class="input" type="number" min="1" step="any" value="${rec.amount || ''}" required />
        </div>
        <div class="form-group">
          ${isWeekly ? `
            <label class="form-label" for="m-rec-dow">วันในสัปดาห์</label>
            <select id="m-rec-dow" class="select">
              ${WEEKDAY_OPTIONS.map((w) => `<option value="${w.value}" ${Number(rec.dayOfWeek ?? 1) === w.value ? 'selected' : ''}>${w.label}</option>`).join('')}
            </select>
          ` : `
            <label class="form-label" for="m-rec-day">วันที่จ่ายของเดือน (1–28)</label>
            <input id="m-rec-day" class="input" type="number" min="1" max="28" value="${rec.dueDay || 1}" required />
          `}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="m-rec-cat">หมวดหมู่</label>
        <select id="m-rec-cat" class="select">
          ${cats.map((c) => `<option value="${escapeHtml(c.id)}" ${rec.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.icon)} ${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </div>
      <button type="submit" class="btn btn-primary btn-full">บันทึกรายการประจำ</button>
    </form>
  `);

  document.getElementById('modal-rec-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('m-rec-name').value.trim();
    const amount = Number(document.getElementById('m-rec-amount').value);
    if (!name || !Number.isFinite(amount) || amount <= 0) return;

    await store.saveRecurring({
      ...rec,
      name,
      amount,
      type: rec.type || (isWeekly ? 'income' : 'expense'),
      frequency: isWeekly ? 'weekly' : 'monthly',
      categoryId: document.getElementById('m-rec-cat').value,
      dayOfWeek: isWeekly ? Number(document.getElementById('m-rec-dow').value) : 1,
      dueDay: !isWeekly ? Number(document.getElementById('m-rec-day').value) : 1
    });
    closeModal();
    showToast('บันทึกรายการประจำแล้ว 🌿');
  });
}

function openWishlistModal(item = null) {
  openModal(item ? 'แก้ไขรุ่นโน้ตบุ๊ก' : 'เพิ่มรุ่นโน้ตบุ๊กที่สนใจ', `
    <form id="modal-wish-form">
      <div class="form-group">
        <label class="form-label" for="m-wish-name">ชื่อรุ่นโน้ตบุ๊ก</label>
        <input id="m-wish-name" class="input" type="text" placeholder="เช่น ASUS Zenbook 14 / Lenovo LOQ" value="${escapeHtml(item?.name || '')}" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="m-wish-price">ราคา (บาท)</label>
        <input id="m-wish-price" class="input" type="number" min="1000" step="100" value="${item?.price || ''}" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="m-wish-specs">สเปกสั้น ๆ</label>
        <input id="m-wish-specs" class="input" type="text" placeholder="เช่น Ryzen 7, RAM 16GB, SSD 512GB" value="${escapeHtml(item?.specs || '')}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="m-wish-link">ลิงก์สินค้า (ถ้ามี)</label>
        <input id="m-wish-link" class="input" type="url" placeholder="https://..." value="${escapeHtml(item?.link || '')}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="m-wish-note">โน้ตเพิ่มเติม</label>
        <input id="m-wish-note" class="input" type="text" placeholder="เช่น น้ำหนักเบา แบตอึด" value="${escapeHtml(item?.note || '')}" />
      </div>
      <button type="submit" class="btn btn-primary btn-full">บันทึกรุ่นที่สนใจ</button>
    </form>
  `);

  document.getElementById('modal-wish-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('m-wish-name').value.trim();
    const price = Number(document.getElementById('m-wish-price').value);
    if (!name || !Number.isFinite(price) || price <= 0) return;

    await store.saveWishlistItem({
      ...(item || {}),
      name,
      price,
      specs: document.getElementById('m-wish-specs').value.trim(),
      link: document.getElementById('m-wish-link').value.trim(),
      note: document.getElementById('m-wish-note').value.trim()
    });
    closeModal();
    showToast('บันทึกรุ่นโน้ตบุ๊กแล้ว 💻');
  });
}

function openWipeConfirmModal() {
  openModal('ยืนยันการล้างข้อมูลทั้งหมด', `
    <p>การล้างข้อมูลจะลบรายการทั้งหมดและรีเซ็ตกลับเป็นค่าเริ่มต้น แนะนำให้กดส่งออก JSON สำรองไว้ก่อนนะ</p>
    <div class="form-group">
      <label class="form-label" for="m-wipe-input">พิมพ์คำว่า <strong>ยืนยันลบ</strong> เพื่อยืนยันชั้นที่ 2</label>
      <input id="m-wipe-input" class="input" type="text" placeholder="ยืนยันลบ" autocomplete="off" />
    </div>
    <button id="m-wipe-confirm-btn" class="btn btn-peach btn-full" type="button" disabled>ล้างข้อมูลทั้งหมด</button>
  `);

  const input = document.getElementById('m-wipe-input');
  const confirmBtn = document.getElementById('m-wipe-confirm-btn');
  input.addEventListener('input', () => {
    confirmBtn.disabled = input.value.trim() !== 'ยืนยันลบ';
  });
  confirmBtn.addEventListener('click', async () => {
    await store.wipeAllData();
    closeModal();
    showToast('รีเซ็ตข้อมูลกลับเป็นค่าเริ่มต้นเรียบร้อยแล้ว 🌿');
  });
}

// ---------------------------------------------------------
// ตัวช่วยวาดรายการธุรกรรม & กราฟ Chart.js
// ---------------------------------------------------------
function renderTransactionRow(tx, catMap) {
  const cat = catMap[tx.categoryId] || { icon: '🌿', name: 'อื่น ๆ', color: '#E2ECE9' };
  const sign = tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '↗ ';
  return `
    <div class="tx-row">
      <button class="tx-item" data-edit-tx="${escapeHtml(tx.id)}" type="button">
        <div class="tx-left">
          <span class="tx-icon" style="background:${escapeHtml(cat.color || '#E2ECE9')}">${escapeHtml(cat.icon || '🌿')}</span>
          <div class="tx-meta">
            <div class="tx-title">${escapeHtml(cat.name)}</div>
            <div class="tx-sub">${formatThaiDate(tx.date)}${tx.note ? ` • ${escapeHtml(tx.note)}` : ''}</div>
          </div>
        </div>
        <div class="tx-amount ${escapeHtml(tx.type)}">${sign}${formatBaht(tx.amount)}</div>
      </button>
      <button class="tx-del" data-del-tx="${escapeHtml(tx.id)}" type="button" aria-label="ลบรายการนี้" title="ลบรายการนี้">🗑️</button>
    </div>
  `;
}

function bindTransactionRowClicks(root) {
  // ปุ่มถังขยะ: ลบทันที (มีปุ่มเลิกทำ 5 วินาที)
  root.querySelectorAll('[data-del-tx]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const removed = await store.deleteTransaction(btn.dataset.delTx);
      if (removed) {
        showToast('ลบรายการแล้ว', async () => {
          await store.saveTransaction(removed, { skipUsageIncrement: true });
        });
      }
    });
  });
  root.querySelectorAll('[data-edit-tx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tx = store.state.transactions.find((t) => t.id === btn.dataset.editTx);
      if (tx) openTransactionSheet({ tx });
    });
  });
}

function destroyCharts() {
  for (const key of Object.keys(uiState.charts)) {
    try { uiState.charts[key].destroy(); } catch {}
    delete uiState.charts[key];
  }
}

function drawCategoryDoughnut(canvasId, txList, categories) {
  const el = document.getElementById(canvasId);
  if (!el || typeof window.Chart === 'undefined') return;

  const totals = {};
  for (const t of txList.filter((x) => x.type === 'expense')) {
    totals[t.categoryId] = (totals[t.categoryId] || 0) + Number(t.amount);
  }
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));

  uiState.charts[canvasId] = new window.Chart(el, {
    type: 'doughnut',
    data: {
      labels: entries.map(([id]) => catMap[id]?.name || 'อื่น ๆ'),
      datasets: [{
        data: entries.map(([, val]) => val),
        backgroundColor: entries.map(([id], idx) => catMap[id]?.color || PASTEL_COLORS[idx % PASTEL_COLORS.length]),
        borderColor: '#FFFFFF',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { color: '#2F4F46', font: { family: 'Noto Sans Thai' } } }
      }
    }
  });
}

function drawSavingsVsPlanChart(canvasId, todayIso, goal, transactions) {
  const el = document.getElementById(canvasId);
  if (!el || typeof window.Chart === 'undefined') return;

  const plan = buildWeeklySavingsPlan({ todayIso, goal, transactions });
  // เลือกจุดตัวอย่างไม่เกิน 14 จุดเพื่อให้อ่านง่ายบนมือถือ
  const step = Math.max(1, Math.ceil(plan.length / 14));
  const sampled = plan.filter((_, idx) => idx % step === 0 || idx === plan.length - 1);

  uiState.charts[canvasId] = new window.Chart(el, {
    type: 'line',
    data: {
      labels: sampled.map((w) => formatThaiDate(w.weekStart).replace(/\s\d{4}$/, '')),
      datasets: [
        {
          label: 'เงินเก็บสะสมจริง',
          data: sampled.map((w) => (w.weekStart <= getMondayWeekRange(todayIso).start ? w.cumulativeActual : null)),
          borderColor: '#5BBF9F',
          backgroundColor: 'rgba(168, 230, 207, 0.25)',
          fill: true,
          tension: 0.3,
          pointRadius: 3
        },
        {
          label: 'เส้นแผนเป้าหมาย',
          data: sampled.map((w) => w.cumulativePlanned),
          borderColor: '#7CB3E6',
          borderDash: [6, 6],
          fill: false,
          tension: 0.2,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#2F4F46', font: { family: 'Noto Sans Thai' } } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { color: '#55726A' } },
        x: { ticks: { color: '#55726A' } }
      }
    }
  });
}

function drawWeeklyBarChart(canvasId, todayIso, transactions) {
  const el = document.getElementById(canvasId);
  if (!el || typeof window.Chart === 'undefined') return;

  const curWeek = getMondayWeekRange(todayIso).start;
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const start = addDays(curWeek, -i * 7);
    const end = addDays(start, 6);
    const inSum = transactions.filter((t) => t.type === 'income' && t.date >= start && t.date <= end).reduce((s, t) => s + Number(t.amount), 0);
    const outSum = transactions.filter((t) => t.type === 'expense' && t.date >= start && t.date <= end).reduce((s, t) => s + Number(t.amount), 0);
    weeks.push({ label: formatThaiDate(start).replace(/\s\d{4}$/, ''), inSum, outSum });
  }

  uiState.charts[canvasId] = new window.Chart(el, {
    type: 'bar',
    data: {
      labels: weeks.map((w) => w.label),
      datasets: [
        { label: 'รายรับ', data: weeks.map((w) => w.inSum), backgroundColor: '#A8E6CF', borderRadius: 8 },
        { label: 'รายจ่าย', data: weeks.map((w) => w.outSum), backgroundColor: '#FFB7A5', borderRadius: 8 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#2F4F46', font: { family: 'Noto Sans Thai' } } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { color: '#55726A' } },
        x: { ticks: { color: '#55726A' } }
      }
    }
  });
}

// ---------------------------------------------------------
// Toast + Undo 5 วินาที + Confetti เบา ๆ ตอนถึง Milestone
// ---------------------------------------------------------
function showToast(message, undoCallback = null) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    ${undoCallback ? `<button type="button" class="toast-undo">เลิกทำ (Undo)</button>` : ''}
  `;
  container.appendChild(toast);

  const timer = setTimeout(() => toast.remove(), 5000);
  if (undoCallback) {
    toast.querySelector('.toast-undo').addEventListener('click', async () => {
      clearTimeout(timer);
      toast.remove();
      await undoCallback();
      showToast('ย้อนกลับรายการเรียบร้อยแล้ว 🌿');
    });
  }
}

async function checkGoalMilestones(state) {
  const { goal, transactions } = state;
  const target = Number(goal.targetAmount) || 30000;
  const saved = (Number(goal.initialSavings) || 0) + transactions.filter((t) => t.type === 'savings').reduce((s, t) => s + Number(t.amount), 0);
  const pct = target > 0 ? (saved / target) * 100 : 0;
  const celebrated = Array.isArray(goal.celebratedMilestones) ? goal.celebratedMilestones : [];

  const hit = [100, 75, 50, 25, 10].find((m) => pct >= m && !celebrated.includes(m));
  if (!hit) return;

  await store.saveGoal({ celebratedMilestones: [...celebrated, hit] });
  showToast(`🎉 ยินดีด้วยนะ! เก็บเงินซื้อโน้ตบุ๊กถึง ${hit}% แล้ว เก่งมากเลย 🌿`);
  launchGentleConfetti();
}

function launchGentleConfetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.classList.remove('hidden');

  const colors = ['#A8E6CF', '#FFB7A5', '#B5D8F7', '#FFF1B8', '#5BBF9F'];
  const pieces = Array.from({ length: 48 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * 120,
    size: 6 + Math.random() * 6,
    vy: 2 + Math.random() * 2.5,
    vx: (Math.random() - 0.5) * 1.6,
    rot: Math.random() * 360,
    color: colors[Math.floor(Math.random() * colors.length)]
  }));

  let frames = 0;
  function step() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of pieces) {
      p.y += p.vy;
      p.x += p.vx;
      p.rot += 3;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    frames += 1;
    if (frames < 110) {
      requestAnimationFrame(step);
    } else {
      canvas.classList.add('hidden');
    }
  }
  requestAnimationFrame(step);
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
