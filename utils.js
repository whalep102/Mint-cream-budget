/**
 * ยูทิลิตี้ด้านวันที่ (เขตเวลา Asia/Bangkok), การจัดรูปแบบเงินบาท,
 * สูตรคำนวณ "งบใช้ได้วันนี้", เครื่องคำนวณความเป็นไปได้ และตัวจำลอง What-if
 * ออกแบบเป็น Pure Functions เพื่อให้ทดสอบตรรกะได้ง่ายและแม่นยำ
 */

export const BANGKOK_TZ = 'Asia/Bangkok';

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

const THAI_WEEKDAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

/**
 * ตรวจสอบปีอธิกสุรทิน (Leap Year) ในระบบ ค.ศ.
 * @param {number} year
 * @returns {boolean}
 */
export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * คืนจำนวนวันในเดือนที่ระบุ (month เป็น 1-12)
 * @param {number} year
 * @param {number} month
 * @returns {number}
 */
export function getDaysInMonth(year, month) {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1];
}

/**
 * คืนวันที่ปัจจุบันในเขตเวลา Asia/Bangkok รูปแบบ "YYYY-MM-DD" (ปี ค.ศ.)
 * @param {Date} [nowDate]
 * @returns {string}
 */
export function getTodayBangkok(nowDate = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(nowDate);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

/**
 * แปลงสตริง "YYYY-MM-DD" เป็นวัตถุ { year, month, day }
 * @param {string} isoDate
 */
export function parseISODate(isoDate) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  return { year: y, month: m, day: d };
}

/**
 * สร้างสตริง "YYYY-MM-DD" จาก year, month (1-12), day
 */
export function formatISODate(year, month, day) {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * บวก/ลบจำนวนวันจากวันที่ ISO โดยไม่เพี้ยนเรื่อง Timezone/DST (คำนวณบน UTC noon)
 * @param {string} isoDate
 * @param {number} deltaDays
 * @returns {string}
 */
export function addDays(isoDate, deltaDays) {
  const { year, month, day } = parseISODate(isoDate);
  const dt = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return formatISODate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * คำนวณผลต่างของวัน (dateB - dateA) เป็นจำนวนเต็มวัน
 * @param {string} isoDateA
 * @param {string} isoDateB
 * @returns {number}
 */
export function diffDays(isoDateA, isoDateB) {
  const a = parseISODate(isoDateA);
  const b = parseISODate(isoDateB);
  const utcA = Date.UTC(a.year, a.month - 1, a.day);
  const utcB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((utcB - utcA) / 86400000);
}

/**
 * คืนวันในสัปดาห์แบบ JS (0 = อาทิตย์, 1 = จันทร์, ..., 6 = เสาร์)
 * @param {string} isoDate
 * @returns {number}
 */
export function getDayOfWeek(isoDate) {
  const { year, month, day } = parseISODate(isoDate);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
}

/**
 * คืนช่วงสัปดาห์ที่เริ่มต้นวันจันทร์ (Monday -> Sunday) สำหรับวันที่ที่ระบุ
 * @param {string} isoDate
 * @returns {{ start: string, end: string, dayIndex: number, remainingDaysInclusive: number }}
 */
export function getMondayWeekRange(isoDate) {
  const dow = getDayOfWeek(isoDate); // 0=Sun, 1=Mon ... 6=Sat
  const offsetFromMonday = dow === 0 ? 6 : dow - 1; // Mon=0 ... Sun=6
  const start = addDays(isoDate, -offsetFromMonday);
  const end = addDays(start, 6);
  const remainingDaysInclusive = 7 - offsetFromMonday; // Mon=7 ... Sun=1
  return { start, end, dayIndex: offsetFromMonday, remainingDaysInclusive };
}

/**
 * คืนช่วงต้นเดือนถึงสิ้นเดือนของวันที่ที่ระบุ
 * @param {string} isoDate
 * @returns {{ year: number, month: number, monthKey: string, start: string, end: string }}
 */
export function getMonthRange(isoDate) {
  const { year, month } = parseISODate(isoDate);
  const lastDay = getDaysInMonth(year, month);
  return {
    year,
    month,
    monthKey: `${year}-${String(month).padStart(2, '0')}`,
    start: formatISODate(year, month, 1),
    end: formatISODate(year, month, lastDay)
  };
}

/**
 * คืนรหัสเดือนก่อนหน้า ("YYYY-MM")
 * @param {string} monthKey
 * @returns {string}
 */
export function getPreviousMonthKey(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

/**
 * จัดรูปแบบวันที่เป็นภาษาไทยอ่านง่าย (ปี ค.ศ. ตามข้อกำหนด) เช่น "27 พ.ย. 2026"
 * @param {string} isoDate
 * @param {boolean} [includeWeekday=false]
 * @returns {string}
 */
export function formatThaiDate(isoDate, includeWeekday = false) {
  if (!isoDate) return '-';
  const { year, month, day } = parseISODate(isoDate);
  const base = `${day} ${THAI_MONTHS_SHORT[month - 1]} ${year}`;
  if (!includeWeekday) return base;
  const wd = THAI_WEEKDAYS_SHORT[getDayOfWeek(isoDate)];
  return `${wd} ${base}`;
}

/**
 * แสดงชื่อเดือนภาษาไทยเต็ม เช่น "พฤศจิกายน 2026"
 * @param {string} monthKey "YYYY-MM"
 * @returns {string}
 */
export function formatThaiMonthYear(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return `${THAI_MONTHS_FULL[m - 1]} ${y}`;
}

/**
 * จัดรูปแบบสกุลเงินบาท ฿1,234 (ไม่มีทศนิยมหากเป็นจำนวนเต็ม)
 * @param {number} amount
 * @returns {string}
 */
export function formatBaht(amount) {
  const safe = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  const rounded = Math.round(safe);
  const absFormatted = Math.abs(rounded).toLocaleString('en-US');
  return rounded < 0 ? `-฿${absFormatted}` : `฿${absFormatted}`;
}

/**
 * ป้องกัน XSS เมื่อนำข้อความผู้ใช้ไปแสดงใน HTML
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * คำนวณยอดเงินออมสะสมทั้งหมดของเป้าหมาย (เงินเก็บตั้งต้น + รายการประเภท savings)
 * @param {object} goal
 * @param {Array} transactions
 * @returns {number}
 */
export function calculateTotalSaved(goal, transactions = []) {
  const initial = Number(goal?.initialSavings) || 0;
  const txSavings = transactions
    .filter((t) => t.type === 'savings')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  return Math.max(0, initial + txSavings);
}

/**
 * คำนวณรายจ่ายประจำรายเดือนรวมทั้งหมด (เฉพาะรายการที่เปิดใช้งาน)
 * @param {Array} recurringItems
 * @returns {number}
 */
export function getMonthlyFixedExpenseTotal(recurringItems = []) {
  return recurringItems
    .filter((r) => r.frequency === 'monthly' && r.type === 'expense' && r.active !== false)
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
}

/**
 * คำนวณรายรับประจำสัปดาห์รวมทั้งหมด (เฉพาะรายการที่เปิดใช้งาน)
 * @param {Array} recurringItems
 * @returns {number}
 */
export function getWeeklyRecurringIncomeTotal(recurringItems = []) {
  return recurringItems
    .filter((r) => r.frequency === 'weekly' && r.type === 'income' && r.active !== false)
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
}

/**
 * สูตรหลักข้อ 4.1: คำนวณ "งบใช้ได้วันนี้"
 * งบใช้ได้วันนี้ = (รายรับคาดการณ์ของสัปดาห์นี้ − เงินที่ต้องกันเก็บเข้าเป้าหมายของสัปดาห์
 *                  − ส่วนแบ่งรายจ่ายประจำ/Shopee ที่กันไว้รายสัปดาห์ − ที่ใช้จ่ายไปแล้วในสัปดาห์นี้)
 *                  ÷ จำนวนวันที่เหลือในสัปดาห์ (รวมวันนี้)
 *
 * หมายเหตุ: หากค่าติดลบจะส่งคืน safeDailyBudget = 0 พร้อมข้อความให้กำลังใจนุ่มนวล
 */
export function calculateDailyBudget({
  todayIso,
  transactions = [],
  recurring = [],
  goal = {},
  settings = {}
}) {
  const week = getMondayWeekRange(todayIso);
  const expectedWeeklyIncome = getWeeklyRecurringIncomeTotal(recurring) || Number(settings.weeklyIncomeTotal) || 2500;

  // คำนวณเงินที่ต้องกันเก็บเข้าเป้าหมายของสัปดาห์นี้
  const totalSaved = calculateTotalSaved(goal, transactions);
  const targetAmount = Number(goal.targetAmount) || 30000;
  const remainingGoalAmount = Math.max(0, targetAmount - totalSaved);
  const daysUntilTarget = Math.max(1, diffDays(todayIso, goal.targetDate || '2027-02-28'));
  const weeksUntilTarget = Math.max(1, daysUntilTarget / 7);
  const requiredWeeklyGoalSavings = remainingGoalAmount / weeksUntilTarget;

  // ส่วนแบ่งรายจ่ายประจำรายเดือน + งบ Shopee ที่กันไว้รายสัปดาห์ (1 เดือนเฉลี่ย 4.345 สัปดาห์)
  const monthlyFixed = getMonthlyFixedExpenseTotal(recurring);
  const monthlyShopeeReserve = Number(settings.monthlyShopeeReserve ?? 1750);
  const weeklyFixedAndShopeeReserve = (monthlyFixed + monthlyShopeeReserve) / 4.345;

  // รายจ่ายที่เกิดขึ้นแล้วในสัปดาห์นี้ (จันทร์ถึงอาทิตย์ของสัปดาห์นี้)
  // ไม่นับรายการที่เกิดจากบิลประจำรายเดือนหรือ Shopee ซ้ำกับเงินที่กันไว้ล่วงหน้า
  // เพื่อให้ตัวเลขสะท้อนงบใช้จ่ายจริงในชีวิตประจำวันอย่างสมเหตุสมผล
  const weekTransactions = transactions.filter(
    (t) => t.date >= week.start && t.date <= week.end
  );

  const spentThisWeek = weekTransactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const spentToday = weekTransactions
    .filter((t) => t.type === 'expense' && t.date === todayIso)
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  // เงินคงเหลือของสัปดาห์สำหรับใช้จ่าย
  const rawWeeklyPool =
    expectedWeeklyIncome -
    requiredWeeklyGoalSavings -
    weeklyFixedAndShopeeReserve -
    spentThisWeek;

  // งบใช้ได้วันนี้ (หากติดลบ ให้แสดงเป็น 0 พร้อมข้อความนุ่มนวล)
  const rawDailyBudget = rawWeeklyPool / week.remainingDaysInclusive;
  const isOverToday = rawDailyBudget < 0;
  const safeDailyBudget = Math.max(0, Math.floor(rawDailyBudget));

  // งบตั้งต้นของวันนี้ก่อนหักที่ใช้ไปแล้ววันนี้ (ใช้แสดง "ใช้ไปแล้ววันนี้ / เหลือวันนี้")
  const spentBeforeToday = Math.max(0, spentThisWeek - spentToday);
  const startOfDayPool =
    expectedWeeklyIncome -
    requiredWeeklyGoalSavings -
    weeklyFixedAndShopeeReserve -
    spentBeforeToday;
  const startOfDayBudget = Math.max(0, Math.floor(startOfDayPool / week.remainingDaysInclusive));
  const remainingToday = Math.max(0, startOfDayBudget - spentToday);

  return {
    weekStart: week.start,
    weekEnd: week.end,
    remainingDaysInWeek: week.remainingDaysInclusive,
    expectedWeeklyIncome,
    requiredWeeklyGoalSavings: Math.round(requiredWeeklyGoalSavings),
    monthlyFixed,
    monthlyShopeeReserve,
    weeklyFixedAndShopeeReserve: Math.round(weeklyFixedAndShopeeReserve),
    spentThisWeek: Math.round(spentThisWeek),
    spentToday: Math.round(spentToday),
    rawWeeklyPool: Math.round(rawWeeklyPool),
    rawDailyBudget: Math.round(rawDailyBudget),
    safeDailyBudget,
    startOfDayBudget,
    remainingToday,
    isOverToday,
    gentleMessage: isOverToday
      ? 'วันนี้พักก่อนนะ พรุ่งนี้ค่อยว่ากัน 🌿'
      : safeDailyBudget < 120
        ? 'วันนี้ค่อย ๆ ใช้แบบสบาย ๆ นะ เดี๋ยวรอบสัปดาห์ใหม่ก็มาแล้ว 🍃'
        : 'วันนี้ใช้งบนี้ได้แบบสบายใจเลย เงินเก็บโน้ตบุ๊กยังเดินหน้าอยู่ ✨'
  };
}

/**
 * คำนวณค่าเฉลี่ยรายจ่ายจริงของหมวดที่ระบุ (Shopee / ค่ากิน) เพื่อใช้ในเครื่องคำนวณความเป็นไปได้
 * หากยังไม่มีข้อมูลเพียงพอ จะใช้ค่าประมาณการจาก Settings
 */
export function estimateActualSpending({ transactions = [], categories = [], settings = {} }) {
  const shopeeCatIds = new Set(
    categories
      .filter((c) => c.id === 'cat_shopee' || /shopee/i.test(c.name || ''))
      .map((c) => c.id)
  );
  const foodCatIds = new Set(
    categories
      .filter((c) => c.id === 'cat_food' || /กิน|อาหาร|food/i.test(c.name || ''))
      .map((c) => c.id)
  );

  const expenses = transactions.filter((t) => t.type === 'expense');
  const uniqueMonths = new Set(expenses.map((t) => String(t.date || '').slice(0, 7)).filter(Boolean));
  const monthCount = uniqueMonths.size;

  let avgMonthlyShopee = Number(settings.monthlyShopeeReserve ?? 1750);
  let avgWeeklyFood = Number(settings.weeklyFoodEstimate ?? 950);
  let usingActualData = false;

  if (monthCount >= 1) {
    const shopeeTotal = expenses
      .filter((t) => shopeeCatIds.has(t.categoryId))
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    if (shopeeTotal > 0) {
      avgMonthlyShopee = Math.round(shopeeTotal / monthCount);
      usingActualData = true;
    }

    // นับจำนวนสัปดาห์ที่มีการบันทึกรายจ่ายค่ากิน
    const foodExpenses = expenses.filter((t) => foodCatIds.has(t.categoryId));
    if (foodExpenses.length >= 3) {
      const uniqueWeeks = new Set(foodExpenses.map((t) => getMondayWeekRange(t.date).start));
      const foodTotal = foodExpenses.reduce((s, t) => s + (Number(t.amount) || 0), 0);
      avgWeeklyFood = Math.round(foodTotal / Math.max(1, uniqueWeeks.size));
      usingActualData = true;
    }
  }

  return { avgMonthlyShopee, avgWeeklyFood, usingActualData };
}

/**
 * ข้อ 4.3: เครื่องคำนวณความเป็นไปได้ของเป้าหมายโน้ตบุ๊ก + ตัวจำลอง What-if
 */
export function calculateGoalFeasibility({
  todayIso,
  goal = {},
  transactions = [],
  recurring = [],
  settings = {},
  overrides = {}
}) {
  const targetAmount = Number(goal.targetAmount) || 30000;
  const targetDate = goal.targetDate || '2027-02-28';
  const totalSaved = calculateTotalSaved(goal, transactions);
  const remainingAmount = Math.max(0, targetAmount - totalSaved);

  const daysRemaining = Math.max(0, diffDays(todayIso, targetDate));
  const weeksRemaining = Math.max(1, daysRemaining / 7);
  const requiredPerWeek = remainingAmount / weeksRemaining;
  const requiredPerMonth = requiredPerWeek * 4.345;

  const weeklyIncome = getWeeklyRecurringIncomeTotal(recurring) || Number(settings.weeklyIncomeTotal) || 2500;
  const monthlyIncome = weeklyIncome * 4.345;

  // รายจ่ายประจำรายเดือน (อนุญาตให้ What-if ปรับค่า AI ได้)
  const baseMonthlyFixed = getMonthlyFixedExpenseTotal(recurring);
  const currentAiItem = recurring.find((r) => r.id === 'rec_ai' || /ai/i.test(r.name || ''));
  const baseAiCost = currentAiItem ? Number(currentAiItem.amount) : 1000;
  const aiCost = overrides.monthlyAi !== undefined ? Number(overrides.monthlyAi) : baseAiCost;
  const adjustedMonthlyFixed = Math.max(0, baseMonthlyFixed - baseAiCost + aiCost);

  const monthlyShopee =
    overrides.monthlyShopee !== undefined
      ? Number(overrides.monthlyShopee)
      : Number(settings.monthlyShopeeReserve ?? 1750);

  const weeklyFood =
    overrides.weeklyFood !== undefined
      ? Number(overrides.weeklyFood)
      : Number(settings.weeklyFoodEstimate ?? 950);

  // ค่าน้ำมันรายสัปดาห์ (ใช้จากวงเงินค่าน้ำมันเริ่มต้น 300 บาท/สัปดาห์)
  const weeklyFuel = Number(settings.weeklyFuelEstimate ?? 300);

  // คำนวณเงินที่เก็บได้จริงต่อสัปดาห์และต่อเดือน
  const weeklyFixedAndShopee = (adjustedMonthlyFixed + monthlyShopee) / 4.345;
  const realisticPerWeek = weeklyIncome - weeklyFixedAndShopee - weeklyFood - weeklyFuel;
  const realisticPerMonth = realisticPerWeek * 4.345;

  // คำนวณวันที่คาดว่าจะซื้อได้จริง
  let estimatedDate = targetDate;
  let estimatedDaysToGoal = 0;
  let isAchievable = true;
  let isOnTrack = false;

  if (remainingAmount <= 0) {
    estimatedDate = todayIso;
    estimatedDaysToGoal = 0;
    isOnTrack = true;
  } else if (realisticPerWeek <= 0) {
    isAchievable = false;
    isOnTrack = false;
    estimatedDate = null;
    estimatedDaysToGoal = Infinity;
  } else {
    estimatedDaysToGoal = Math.ceil((remainingAmount / realisticPerWeek) * 7);
    estimatedDate = addDays(todayIso, estimatedDaysToGoal);
    isOnTrack = estimatedDate <= targetDate;
  }

  const daysDifferenceFromTarget =
    estimatedDate ? diffDays(targetDate, estimatedDate) : null; // ค่าลบ = เร็วกว่าเป้า, ค่าบวก = ช้ากว่าเป้า

  // ข้อความสรุปแบบนุ่มนวลและตรงไปตรงมา
  let statusTone = 'ontrack';
  let summaryText = '';
  const suggestions = [];

  if (remainingAmount <= 0) {
    statusTone = 'complete';
    summaryText = 'ยินดีด้วยนะ! เก็บเงินครบตามเป้าโน้ตบุ๊กแล้ว พร้อมเลือกเครื่องที่ถูกใจได้เลย 🎉';
  } else if (!isAchievable) {
    statusTone = 'gentle_adjust';
    summaryText =
      'จากค่าใช้จ่ายปัจจุบัน เงินเหลือเก็บต่อสัปดาห์ยังไม่พอขยับเข้าใกล้เป้า ลองเลื่อนสไลเดอร์ด้านล่างดูว่าปรับตรงไหนแล้วสบายใจที่สุดนะ 🌿';
    suggestions.push('ลองปรับลดงบ Shopee รายเดือนลงสัก 500–800 บาท');
    suggestions.push('พิจารณาเลื่อนวันเป้าหมายออกไปอีก 2–3 เดือน เพื่อให้ใช้ชีวิตได้ไม่ตึงเกินไป');
    suggestions.push('ลองเลือกรุ่นโน้ตบุ๊กในช่วง 25,000–28,000 บาทที่ยังตอบโจทย์งานได้ดี');
  } else if (isOnTrack) {
    statusTone = 'ontrack';
    const earlierDays = Math.abs(daysDifferenceFromTarget || 0);
    summaryText =
      earlierDays >= 7
        ? `แผนนี้ไปได้สวยมากเลย! ถ้ารักษาจังหวะนี้ไว้ จะได้ซื้อประมาณ ${formatThaiDate(estimatedDate)} (เร็วกว่ากำหนด ${earlierDays} วัน) 🌱`
        : `จังหวะการออมกำลังพอดีเลย คาดว่าจะเก็บครบประมาณ ${formatThaiDate(estimatedDate)} ทันตามที่ตั้งใจไว้ ✨`;
  } else {
    statusTone = 'gentle_adjust';
    summaryText = `ด้วยจังหวะปัจจุบัน คาดว่าจะได้ซื้อโน้ตบุ๊กประมาณ ${formatThaiDate(estimatedDate)} (ช้ากว่ากำหนดราว ${daysDifferenceFromTarget} วัน) ไม่เป็นไรนะ ลองดูทางเลือกที่สบายใจด้านล่างได้เลย 🍃`;
    const gapPerWeek = Math.ceil(requiredPerWeek - realisticPerWeek);
    suggestions.push(`เพิ่มเงินออมอีกประมาณ ${formatBaht(gapPerWeek)}/สัปดาห์ เพื่อให้ทัน ${formatThaiDate(targetDate)}`);
    suggestions.push(`หรือเลื่อนวันเป้าหมายไปเป็นประมาณ ${formatThaiDate(estimatedDate)} โดยไม่ต้องลดรายจ่ายเพิ่ม`);
    if (targetAmount > 25000) {
      const reducedTarget = Math.max(25000, Math.round((totalSaved + realisticPerWeek * weeksRemaining) / 500) * 500);
      if (reducedTarget < targetAmount) {
        suggestions.push(`หรือปรับงบโน้ตบุ๊กลงมาแถว ${formatBaht(reducedTarget)} เพื่อให้ซื้อได้ทันกำหนดเดิม`);
      }
    }
  }

  return {
    targetAmount,
    targetDate,
    totalSaved,
    remainingAmount,
    progressPercent: targetAmount > 0 ? Math.min(100, Math.round((totalSaved / targetAmount) * 1000) / 10) : 0,
    daysRemaining,
    weeksRemaining: Math.ceil(weeksRemaining),
    requiredPerWeek: Math.round(requiredPerWeek),
    requiredPerMonth: Math.round(requiredPerMonth),
    realisticPerWeek: Math.round(realisticPerWeek),
    realisticPerMonth: Math.round(realisticPerMonth),
    monthlyIncome: Math.round(monthlyIncome),
    adjustedMonthlyFixed: Math.round(adjustedMonthlyFixed),
    monthlyShopee,
    weeklyFood,
    weeklyFuel,
    isAchievable,
    isOnTrack,
    estimatedDate,
    estimatedDaysToGoal,
    daysDifferenceFromTarget,
    statusTone,
    summaryText,
    suggestions
  };
}

/**
 * สร้างตารางแผนการออมรายสัปดาห์ตั้งแต่วันนี้ (หรือสัปดาห์เริ่มต้น) ไปจนถึงวันเป้าหมาย
 */
export function buildWeeklySavingsPlan({ todayIso, goal = {}, transactions = [] }) {
  const targetAmount = Number(goal.targetAmount) || 30000;
  const targetDate = goal.targetDate || '2027-02-28';
  const startDate = goal.createdAt ? String(goal.createdAt).slice(0, 10) : todayIso;
  const planStartWeek = getMondayWeekRange(startDate <= todayIso ? startDate : todayIso).start;
  const endWeek = getMondayWeekRange(targetDate).start;

  const weeks = [];
  let cursor = planStartWeek;
  let guard = 0;
  while (cursor <= endWeek && guard < 156) {
    const end = addDays(cursor, 6);
    weeks.push({ weekStart: cursor, weekEnd: end });
    cursor = addDays(cursor, 7);
    guard += 1;
  }

  if (weeks.length === 0) {
    const w = getMondayWeekRange(todayIso);
    weeks.push({ weekStart: w.start, weekEnd: w.end });
  }

  const initialSavings = Number(goal.initialSavings) || 0;
  const netTarget = Math.max(0, targetAmount - initialSavings);
  const perWeekTarget = Math.ceil(netTarget / weeks.length);
  const currentWeekStart = getMondayWeekRange(todayIso).start;

  let cumulativePlanned = initialSavings;
  let cumulativeActual = initialSavings;

  return weeks.map((w, idx) => {
    const actualThisWeek = transactions
      .filter((t) => t.type === 'savings' && t.date >= w.weekStart && t.date <= w.weekEnd)
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    cumulativePlanned = Math.min(targetAmount, cumulativePlanned + perWeekTarget);
    cumulativeActual += actualThisWeek;

    let status = 'upcoming';
    let statusLabel = 'สัปดาห์ถัดไป';
    if (actualThisWeek >= perWeekTarget && perWeekTarget > 0) {
      status = 'reached';
      statusLabel = 'เก็บถึงแล้ว 🌱';
    } else if (w.weekStart < currentWeekStart) {
      status = 'pending';
      statusLabel = actualThisWeek > 0 ? 'เก็บได้บางส่วน' : 'ยังไม่ได้ออม';
    } else if (w.weekStart === currentWeekStart) {
      status = actualThisWeek > 0 ? 'in_progress' : 'current';
      statusLabel = actualThisWeek > 0 ? 'กำลังสะสม 🍃' : 'สัปดาห์นี้';
    }

    return {
      weekNumber: idx + 1,
      weekStart: w.weekStart,
      weekEnd: w.weekEnd,
      targetThisWeek: perWeekTarget,
      actualThisWeek: Math.round(actualThisWeek),
      cumulativePlanned: Math.round(cumulativePlanned),
      cumulativeActual: Math.round(cumulativeActual),
      isCurrentWeek: w.weekStart === currentWeekStart,
      status,
      statusLabel
    };
  });
}

/**
 * แปลงรายการธุรกรรมเป็น CSV (รองรับ UTF-8 BOM เพื่อเปิดใน Excel ภาษาไทยไม่เพี้ยน)
 */
export function transactionsToCSV(transactions = [], categories = []) {
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const header = ['date', 'type', 'category', 'amount', 'note', 'id'];
  const rows = transactions.map((t) => [
    t.date || '',
    t.type || '',
    catMap[t.categoryId] || t.categoryId || '',
    Number(t.amount) || 0,
    `"${String(t.note || '').replace(/"/g, '""')}"`,
    t.id || ''
  ]);
  return '\uFEFF' + [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * แปลงข้อความ CSV กลับเป็นรายการธุรกรรม
 */
export function parseTransactionsCSV(csvText, categories = []) {
  const clean = String(csvText || '').replace(/^\uFEFF/, '').trim();
  const lines = clean.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const catByName = Object.fromEntries(
    categories.map((c) => [String(c.name).trim().toLowerCase(), c.id])
  );

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    // แยกคอลัมน์แบบรองรับเครื่องหมายคำพูด "..."
    const cols = [];
    let current = '';
    let inQuotes = false;
    for (let j = 0; j < lines[i].length; j++) {
      const ch = lines[i][j];
      if (ch === '"' && lines[i][j + 1] === '"') {
        current += '"';
        j++;
      } else if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cols.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    cols.push(current);

    const [date, type, categoryName, amountStr, note] = cols;
    const amount = Number(amountStr);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) continue;
    if (!['income', 'expense', 'savings'].includes((type || '').trim())) continue;
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const matchedCatId =
      catByName[(categoryName || '').trim().toLowerCase()] ||
      (type === 'income' ? 'cat_inc_other' : type === 'savings' ? 'cat_savings' : 'cat_other');

    results.push({
      date: date.trim(),
      type: type.trim(),
      categoryId: matchedCatId,
      amount,
      note: (note || '').trim()
    });
  }
  return results;
}
