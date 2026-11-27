/**
 * ระบบจัดการข้อมูลและการซิงก์แบบเรียลไทม์ (Firebase Auth + Cloud Firestore)
 * พร้อมโหมดสำรองบนเครื่อง (Local Mode) หากยังไม่ได้ใส่ Firebase Config
 *
 * โครงสร้าง Firestore ของผู้ใช้แต่ละคน (แยกตาม UID):
 * - users/{uid}/transactions/{txId}
 * - users/{uid}/categories/{catId}
 * - users/{uid}/recurring/{recId}
 * - users/{uid}/goals/main
 * - users/{uid}/wishlist/{itemId}
 * - users/{uid}/settings/main
 */

import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';
import {
  getTodayBangkok,
  getMondayWeekRange,
  getMonthRange,
  addDays
} from './utils.js';

const LOCAL_STORAGE_KEY = 'mintcream_budget_local_v1';

// ---------------------------------------------------------
// ค่าเริ่มต้นตามบริบทของผู้ใช้ (แก้ไขได้ทั้งหมดในหน้าตั้งค่า)
// ---------------------------------------------------------
export function createDefaultState(todayIso = getTodayBangkok()) {
  return {
    categories: [
      // หมวดรายจ่ายเริ่มต้น
      { id: 'cat_food', name: 'ค่ากิน', type: 'expense', icon: '🍱', color: '#FFB7A5', usageCount: 5 },
      { id: 'cat_fuel', name: 'ค่าน้ำมัน/เดินทาง', type: 'expense', icon: '⛽', color: '#FFD3B6', usageCount: 3 },
      { id: 'cat_shopee', name: 'Shopee', type: 'expense', icon: '🛍️', color: '#FFCCB8', usageCount: 2 },
      { id: 'cat_ai', name: 'AI', type: 'expense', icon: '🤖', color: '#D8C7FF', usageCount: 1 },
      { id: 'cat_youtube', name: 'YouTube/บันเทิง', type: 'expense', icon: '🎬', color: '#FFC9DE', usageCount: 1 },
      { id: 'cat_other', name: 'อื่น ๆ', type: 'expense', icon: '🧺', color: '#E2ECE9', usageCount: 0 },

      // หมวดรายรับเริ่มต้น
      { id: 'cat_inc_weekly', name: 'เงินรายสัปดาห์', type: 'income', icon: '💵', color: '#A8E6CF', usageCount: 5 },
      { id: 'cat_inc_fuel', name: 'ค่าน้ำมัน', type: 'income', icon: '⛽', color: '#BCEAD5', usageCount: 3 },
      { id: 'cat_inc_other', name: 'อื่น ๆ', type: 'income', icon: '✨', color: '#FFF1B8', usageCount: 0 },

      // หมวดออมเข้าเป้าหมาย
      { id: 'cat_savings', name: 'ออมเข้าเป้าหมาย', type: 'savings', icon: '💻', color: '#B5D8F7', usageCount: 5 }
    ],
    recurring: [
      // รายรับประจำสัปดาห์ (ค่าเริ่มต้นวันจันทร์: 2,200 + 300 = 2,500 บาท)
      {
        id: 'rec_weekly_main',
        name: 'เงินรายสัปดาห์',
        type: 'income',
        frequency: 'weekly',
        amount: 2200,
        categoryId: 'cat_inc_weekly',
        dayOfWeek: 1, // 1 = วันจันทร์
        active: true,
        appliedPeriods: {}
      },
      {
        id: 'rec_weekly_fuel',
        name: 'ค่าน้ำมันรายสัปดาห์',
        type: 'income',
        frequency: 'weekly',
        amount: 300,
        categoryId: 'cat_inc_fuel',
        dayOfWeek: 1, // 1 = วันจันทร์
        active: true,
        appliedPeriods: {}
      },
      // รายจ่ายประจำรายเดือน (ขึ้นอัตโนมัติทุกเดือนเป็นสถานะ "รอจ่าย")
      {
        id: 'rec_ai',
        name: 'ค่า AI',
        type: 'expense',
        frequency: 'monthly',
        amount: 1000,
        categoryId: 'cat_ai',
        dueDay: 1,
        active: true,
        paidMonths: {}
      },
      {
        id: 'rec_youtube',
        name: 'YouTube',
        type: 'expense',
        frequency: 'monthly',
        amount: 130,
        categoryId: 'cat_youtube',
        dueDay: 1,
        active: true,
        paidMonths: {}
      }
    ],
    goal: {
      id: 'main',
      name: 'โน้ตบุ๊กสายทำงาน (เล่นเกมเบา ๆ)',
      targetAmount: 30000,
      targetDate: '2027-02-28',
      initialSavings: 0,
      selectedWishlistId: null,
      celebratedMilestones: [],
      createdAt: todayIso
    },
    settings: {
      id: 'main',
      weeklyIncomeTotal: 2500,
      weeklyIncomeDay: 1,
      monthlyShopeeReserve: 1750,
      weeklyFoodEstimate: 950,
      weeklyFuelEstimate: 300,
      weekStartsOn: 1,
      currency: 'THB'
    },
    transactions: [],
    wishlist: []
  };
}

function generateId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------
// คลาส Store กลางสำหรับจัดการข้อมูลและแจ้งเตือน UI เมื่อข้อมูลเปลี่ยน
// ---------------------------------------------------------
export class BudgetStore {
  constructor() {
    this.mode = isFirebaseConfigured() ? 'firebase' : 'local';
    this.user = null;
    this.syncStatus = this.mode === 'firebase' ? 'connecting' : 'local';
    this.state = createDefaultState();
    this.listeners = new Set();
    this.unsubscribers = [];

    // ตัวแปร Firebase SDK (โหลดแบบไดนามิกเฉพาะเมื่อตั้งค่า Firebase แล้ว)
    this.fb = null;
    this.auth = null;
    this.db = null;
    this.googleProvider = null;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) {
      fn(this.state, {
        mode: this.mode,
        user: this.user,
        syncStatus: this.syncStatus
      });
    }
  }

  async init() {
    if (this.mode === 'local') {
      this.loadLocal();
      await this.ensureWeeklyRecurringIncome();
      this.notify();
      return;
    }

    try {
      // โหลด Firebase Modular SDK v10 ผ่าน CDN (ไม่ต้องมี build step)
      const [appMod, authMod, fsMod] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js')
      ]);

      this.fb = { ...appMod, ...authMod, ...fsMod };
      const app = appMod.initializeApp(firebaseConfig);
      this.auth = authMod.getAuth(app);
      this.googleProvider = new authMod.GoogleAuthProvider();

      // เปิด Cloud Firestore Offline Persistence เพื่อใช้งานได้แม้ไม่มีเน็ต
      this.db = fsMod.initializeFirestore(app, {
        localCache: fsMod.persistentLocalCache({
          tabManager: fsMod.persistentMultipleTabManager()
        })
      });

      authMod.onAuthStateChanged(this.auth, async (user) => {
        this.detachFirestoreListeners();
        this.user = user;
        if (user) {
          this.syncStatus = 'syncing';
          this.notify();
          await this.seedUserIfNew(user.uid);
          this.attachFirestoreListeners(user.uid);
        } else {
          this.syncStatus = 'signed_out';
          this.state = createDefaultState();
          this.notify();
        }
      });
    } catch (err) {
      console.error('ไม่สามารถเชื่อมต่อ Firebase ได้ สลับไปใช้โหมดบนเครื่องชั่วคราว:', err);
      this.mode = 'local';
      this.syncStatus = 'local';
      this.loadLocal();
      await this.ensureWeeklyRecurringIncome();
      this.notify();
    }
  }

  // -------------------- Authentication --------------------
  async signInWithGoogle() {
    if (this.mode !== 'firebase' || !this.auth) {
      throw new Error('ยังไม่ได้ตั้งค่า Firebase Config ในไฟล์ firebase-config.js');
    }
    await this.fb.signInWithPopup(this.auth, this.googleProvider);
  }

  async signOut() {
    if (this.mode === 'firebase' && this.auth) {
      await this.fb.signOut(this.auth);
    }
  }

  // -------------------- Local Persistence --------------------
  loadLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const defaults = createDefaultState();
        this.state = {
          ...defaults,
          ...parsed,
          goal: { ...defaults.goal, ...(parsed.goal || {}) },
          settings: { ...defaults.settings, ...(parsed.settings || {}) },
          categories: Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories : defaults.categories,
          recurring: Array.isArray(parsed.recurring) ? parsed.recurring : defaults.recurring,
          transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
          wishlist: Array.isArray(parsed.wishlist) ? parsed.wishlist : []
        };
      } else {
        this.state = createDefaultState();
        this.saveLocal();
      }
    } catch {
      this.state = createDefaultState();
      this.saveLocal();
    }
  }

  saveLocal() {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.state));
    } catch (err) {
      console.error('บันทึกข้อมูลลงเครื่องไม่สำเร็จ:', err);
    }
  }

  // -------------------- Firestore Setup & Listeners --------------------
  userCollection(name) {
    return this.fb.collection(this.db, 'users', this.user.uid, name);
  }

  userDoc(name, id) {
    return this.fb.doc(this.db, 'users', this.user.uid, name, id);
  }

  async seedUserIfNew(uid) {
    const settingsRef = this.fb.doc(this.db, 'users', uid, 'settings', 'main');
    const snap = await this.fb.getDoc(settingsRef);
    if (snap.exists()) return;

    const defaults = createDefaultState();
    const batch = this.fb.writeBatch(this.db);
    batch.set(settingsRef, defaults.settings);
    batch.set(this.fb.doc(this.db, 'users', uid, 'goals', 'main'), defaults.goal);

    for (const cat of defaults.categories) {
      batch.set(this.fb.doc(this.db, 'users', uid, 'categories', cat.id), cat);
    }
    for (const rec of defaults.recurring) {
      batch.set(this.fb.doc(this.db, 'users', uid, 'recurring', rec.id), rec);
    }
    await batch.commit();
  }

  attachFirestoreListeners(uid) {
    const { collection, doc, onSnapshot } = this.fb;
    let initialLoaded = 0;
    const markSynced = () => {
      initialLoaded += 1;
      if (initialLoaded >= 6) {
        this.syncStatus = navigator.onLine ? 'synced' : 'offline';
        this.ensureWeeklyRecurringIncome();
      }
      this.notify();
    };

    const unsubTx = onSnapshot(collection(this.db, 'users', uid, 'transactions'), (snap) => {
      this.state.transactions = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
      markSynced();
    });

    const unsubCat = onSnapshot(collection(this.db, 'users', uid, 'categories'), (snap) => {
      if (!snap.empty) {
        this.state.categories = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
      markSynced();
    });

    const unsubRec = onSnapshot(collection(this.db, 'users', uid, 'recurring'), (snap) => {
      this.state.recurring = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      markSynced();
    });

    const unsubGoal = onSnapshot(doc(this.db, 'users', uid, 'goals', 'main'), (snap) => {
      if (snap.exists()) {
        this.state.goal = { ...createDefaultState().goal, ...snap.data(), id: 'main' };
      }
      markSynced();
    });

    const unsubWish = onSnapshot(collection(this.db, 'users', uid, 'wishlist'), (snap) => {
      this.state.wishlist = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
      markSynced();
    });

    const unsubSet = onSnapshot(doc(this.db, 'users', uid, 'settings', 'main'), (snap) => {
      if (snap.exists()) {
        this.state.settings = { ...createDefaultState().settings, ...snap.data(), id: 'main' };
      }
      markSynced();
    });

    this.unsubscribers = [unsubTx, unsubCat, unsubRec, unsubGoal, unsubWish, unsubSet];
  }

  detachFirestoreListeners() {
    for (const unsub of this.unsubscribers) {
      try { unsub(); } catch {}
    }
    this.unsubscribers = [];
  }

  // -------------------- Recurring Automation --------------------
  /**
   * สร้างรายการรายรับประจำสัปดาห์อัตโนมัติ (วันจันทร์เป็นค่าเริ่มต้น)
   * โดยจะสร้างเพียง 1 ครั้งต่อสัปดาห์ เพื่อให้ผู้ใช้แก้ยอดเฉพาะสัปดาห์นั้นได้ตามใจ
   */
  async ensureWeeklyRecurringIncome(todayIso = getTodayBangkok()) {
    const week = getMondayWeekRange(todayIso);
    const weeklyItems = this.state.recurring.filter(
      (r) => r.frequency === 'weekly' && r.type === 'income' && r.active !== false
    );

    for (const rec of weeklyItems) {
      const targetDow = Number(rec.dayOfWeek ?? 1); // 1=Mon ... 7=Sun (หรือ 0=Sun)
      const offset = targetDow === 0 ? 6 : targetDow - 1;
      const scheduledDate = addDays(week.start, offset);
      const periodKey = week.start;

      if (todayIso >= scheduledDate && !rec.appliedPeriods?.[periodKey]) {
        const txId = generateId('tx');
        const newTx = {
          id: txId,
          type: 'income',
          amount: Number(rec.amount) || 0,
          categoryId: rec.categoryId || 'cat_inc_weekly',
          date: scheduledDate,
          note: `${rec.name} (อัตโนมัติประจำสัปดาห์)`,
          recurringId: rec.id,
          periodKey,
          createdAt: Date.now()
        };

        const updatedRec = {
          ...rec,
          appliedPeriods: { ...(rec.appliedPeriods || {}), [periodKey]: txId }
        };

        await this.saveTransaction(newTx, { skipUsageIncrement: true });
        await this.saveRecurring(updatedRec);
      }
    }
  }

  /**
   * ดึงรายการรายจ่ายประจำรายเดือนของเดือนปัจจุบัน พร้อมสถานะ "รอจ่าย" / "จ่ายแล้ว"
   */
  getMonthlyRecurringStatus(todayIso = getTodayBangkok()) {
    const { monthKey } = getMonthRange(todayIso);
    return this.state.recurring
      .filter((r) => r.frequency === 'monthly' && r.type === 'expense' && r.active !== false)
      .map((r) => ({
        ...r,
        monthKey,
        isPaid: Boolean(r.paidMonths?.[monthKey]),
        paidTxId: r.paidMonths?.[monthKey] || null
      }))
      .sort((a, b) => Number(a.isPaid) - Number(b.isPaid) || (a.dueDay || 1) - (b.dueDay || 1));
  }

  /**
   * กดติ๊ก "จ่ายแล้ว" ให้กับรายจ่ายประจำรายเดือน
   */
  async markMonthlyBillPaid(recurringId, todayIso = getTodayBangkok()) {
    const rec = this.state.recurring.find((r) => r.id === recurringId);
    if (!rec) return null;
    const { monthKey } = getMonthRange(todayIso);
    if (rec.paidMonths?.[monthKey]) return null;

    const tx = await this.saveTransaction({
      id: generateId('tx'),
      type: 'expense',
      amount: Number(rec.amount) || 0,
      categoryId: rec.categoryId || 'cat_other',
      date: todayIso,
      note: `${rec.name} (ประจำเดือน ${monthKey})`,
      recurringId: rec.id,
      periodKey: monthKey,
      createdAt: Date.now()
    });

    await this.saveRecurring({
      ...rec,
      paidMonths: { ...(rec.paidMonths || {}), [monthKey]: tx.id }
    });
    return tx;
  }

  // -------------------- CRUD: Transactions --------------------
  async saveTransaction(txData, options = {}) {
    const isNew = !txData.id || !this.state.transactions.some((t) => t.id === txData.id);
    const tx = {
      id: txData.id || generateId('tx'),
      type: txData.type,
      amount: Number(txData.amount),
      categoryId: txData.categoryId,
      date: txData.date,
      note: (txData.note || '').trim(),
      recurringId: txData.recurringId || null,
      periodKey: txData.periodKey || null,
      createdAt: txData.createdAt || Date.now()
    };

    if (this.mode === 'firebase' && this.user) {
      await this.fb.setDoc(this.userDoc('transactions', tx.id), tx);
    } else {
      if (isNew) {
        this.state.transactions = [tx, ...this.state.transactions];
      } else {
        this.state.transactions = this.state.transactions.map((t) => (t.id === tx.id ? tx : t));
      }
      this.state.transactions.sort(
        (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0)
      );
      this.saveLocal();
      this.notify();
    }

    // จำหมวดที่ใช้บ่อยล่าสุดมาไว้ด้านหน้า
    if (isNew && !options.skipUsageIncrement) {
      const cat = this.state.categories.find((c) => c.id === tx.categoryId);
      if (cat) {
        await this.saveCategory({
          ...cat,
          usageCount: (Number(cat.usageCount) || 0) + 1,
          lastUsedAt: Date.now()
        });
      }
    }

    return tx;
  }

  async deleteTransaction(txId) {
    const existing = this.state.transactions.find((t) => t.id === txId);
    if (!existing) return null;

    if (this.mode === 'firebase' && this.user) {
      await this.fb.deleteDoc(this.userDoc('transactions', txId));
    } else {
      this.state.transactions = this.state.transactions.filter((t) => t.id !== txId);
      this.saveLocal();
      this.notify();
    }

    // ถ้าเป็นรายการที่เกิดจากบิลประจำรายเดือน ให้คืนสถานะเป็น "รอจ่าย"
    if (existing.recurringId && existing.periodKey) {
      const rec = this.state.recurring.find((r) => r.id === existing.recurringId);
      if (rec && rec.frequency === 'monthly' && rec.paidMonths?.[existing.periodKey] === txId) {
        const nextPaid = { ...(rec.paidMonths || {}) };
        delete nextPaid[existing.periodKey];
        await this.saveRecurring({ ...rec, paidMonths: nextPaid });
      }
    }

    return existing;
  }

  // -------------------- CRUD: Categories --------------------
  async saveCategory(catData) {
    const cat = {
      id: catData.id || generateId('cat'),
      name: (catData.name || '').trim(),
      type: catData.type || 'expense',
      icon: catData.icon || '🌿',
      color: catData.color || '#A8E6CF',
      usageCount: Number(catData.usageCount) || 0,
      lastUsedAt: catData.lastUsedAt || 0
    };

    if (this.mode === 'firebase' && this.user) {
      await this.fb.setDoc(this.userDoc('categories', cat.id), cat);
    } else {
      const exists = this.state.categories.some((c) => c.id === cat.id);
      this.state.categories = exists
        ? this.state.categories.map((c) => (c.id === cat.id ? cat : c))
        : [...this.state.categories, cat];
      this.saveLocal();
      this.notify();
    }
    return cat;
  }

  async deleteCategory(catId) {
    if (this.mode === 'firebase' && this.user) {
      await this.fb.deleteDoc(this.userDoc('categories', catId));
    } else {
      this.state.categories = this.state.categories.filter((c) => c.id !== catId);
      this.saveLocal();
      this.notify();
    }
  }

  // -------------------- CRUD: Recurring --------------------
  async saveRecurring(recData) {
    const rec = {
      id: recData.id || generateId('rec'),
      name: (recData.name || '').trim(),
      type: recData.type || 'expense',
      frequency: recData.frequency || 'monthly',
      amount: Number(recData.amount) || 0,
      categoryId: recData.categoryId || 'cat_other',
      dueDay: Number(recData.dueDay ?? 1),
      dayOfWeek: Number(recData.dayOfWeek ?? 1),
      active: recData.active !== false,
      paidMonths: recData.paidMonths || {},
      appliedPeriods: recData.appliedPeriods || {}
    };

    if (this.mode === 'firebase' && this.user) {
      await this.fb.setDoc(this.userDoc('recurring', rec.id), rec);
    } else {
      const exists = this.state.recurring.some((r) => r.id === rec.id);
      this.state.recurring = exists
        ? this.state.recurring.map((r) => (r.id === rec.id ? rec : r))
        : [...this.state.recurring, rec];
      this.saveLocal();
      this.notify();
    }
    return rec;
  }

  async deleteRecurring(recId) {
    if (this.mode === 'firebase' && this.user) {
      await this.fb.deleteDoc(this.userDoc('recurring', recId));
    } else {
      this.state.recurring = this.state.recurring.filter((r) => r.id !== recId);
      this.saveLocal();
      this.notify();
    }
  }

  // -------------------- CRUD: Goal & Settings --------------------
  async saveGoal(partialGoal) {
    const updated = { ...this.state.goal, ...partialGoal, id: 'main' };
    if (this.mode === 'firebase' && this.user) {
      await this.fb.setDoc(this.userDoc('goals', 'main'), updated);
    } else {
      this.state.goal = updated;
      this.saveLocal();
      this.notify();
    }
    return updated;
  }

  async saveSettings(partialSettings) {
    const updated = { ...this.state.settings, ...partialSettings, id: 'main' };
    if (this.mode === 'firebase' && this.user) {
      await this.fb.setDoc(this.userDoc('settings', 'main'), updated);
    } else {
      this.state.settings = updated;
      this.saveLocal();
      this.notify();
    }
    return updated;
  }

  // -------------------- CRUD: Laptop Wishlist --------------------
  async saveWishlistItem(itemData) {
    const item = {
      id: itemData.id || generateId('wish'),
      name: (itemData.name || '').trim(),
      price: Number(itemData.price) || 0,
      link: (itemData.link || '').trim(),
      specs: (itemData.specs || '').trim(),
      note: (itemData.note || '').trim(),
      createdAt: itemData.createdAt || Date.now()
    };

    if (this.mode === 'firebase' && this.user) {
      await this.fb.setDoc(this.userDoc('wishlist', item.id), item);
    } else {
      const exists = this.state.wishlist.some((w) => w.id === item.id);
      this.state.wishlist = exists
        ? this.state.wishlist.map((w) => (w.id === item.id ? item : w))
        : [...this.state.wishlist, item];
      this.state.wishlist.sort((a, b) => a.price - b.price);
      this.saveLocal();
      this.notify();
    }
    return item;
  }

  async deleteWishlistItem(itemId) {
    if (this.mode === 'firebase' && this.user) {
      await this.fb.deleteDoc(this.userDoc('wishlist', itemId));
    } else {
      this.state.wishlist = this.state.wishlist.filter((w) => w.id !== itemId);
      this.saveLocal();
      this.notify();
    }
  }

  // -------------------- Backup: Export / Import / Wipe --------------------
  exportJSON() {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        appVersion: '1.0.0',
        data: this.state
      },
      null,
      2
    );
  }

  async importJSON(jsonText) {
    const parsed = JSON.parse(jsonText);
    const data = parsed.data || parsed;
    if (!data || typeof data !== 'object') {
      throw new Error('ไฟล์สำรองข้อมูลไม่ถูกต้อง');
    }

    const defaults = createDefaultState();
    const nextState = {
      categories: Array.isArray(data.categories) && data.categories.length ? data.categories : defaults.categories,
      recurring: Array.isArray(data.recurring) ? data.recurring : defaults.recurring,
      goal: { ...defaults.goal, ...(data.goal || {}), id: 'main' },
      settings: { ...defaults.settings, ...(data.settings || {}), id: 'main' },
      transactions: Array.isArray(data.transactions) ? data.transactions : [],
      wishlist: Array.isArray(data.wishlist) ? data.wishlist : []
    };

    if (this.mode === 'firebase' && this.user) {
      await this.wipeAllData({ skipReseed: true });
      for (const cat of nextState.categories) await this.saveCategory(cat);
      for (const rec of nextState.recurring) await this.saveRecurring(rec);
      for (const tx of nextState.transactions) await this.saveTransaction(tx, { skipUsageIncrement: true });
      for (const w of nextState.wishlist) await this.saveWishlistItem(w);
      await this.saveGoal(nextState.goal);
      await this.saveSettings(nextState.settings);
    } else {
      this.state = nextState;
      this.saveLocal();
      this.notify();
    }
  }

  async wipeAllData({ skipReseed = false } = {}) {
    if (this.mode === 'firebase' && this.user) {
      const cols = ['transactions', 'categories', 'recurring', 'wishlist'];
      for (const colName of cols) {
        const snap = await this.fb.getDocs(this.userCollection(colName));
        for (const d of snap.docs) {
          await this.fb.deleteDoc(d.ref);
        }
      }
      await this.fb.deleteDoc(this.userDoc('goals', 'main'));
      await this.fb.deleteDoc(this.userDoc('settings', 'main'));
      if (!skipReseed) {
        await this.seedUserIfNew(this.user.uid);
      }
    } else {
      this.state = createDefaultState();
      this.saveLocal();
      this.notify();
    }
  }
}
