// ================================================================
// app.js - نسخه مجهز به بایگانی دائمی PDF، حفظ مانده نقدینگی و رسید اقساط
// ================================================================

function toEnglishDigits(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/[۰-۹]/g, function (w) { return String.fromCharCode(w.charCodeAt(0) - 1728); })
    .replace(/[٠-٩]/g, function (w) { return String.fromCharCode(w.charCodeAt(0) - 1584); });
}

function gregorianToJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = (gy <= 1600) ? 0 : 979;
  gy -= (gy <= 1600) ? 621 : 1600;
  let gy2 = (gm > 2) ? (gy + 1) : gy;
  let days = (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  jy += Math.floor((days - 1) / 365);
  if (days > 0) days = (days - 1) % 365;
  let jm = (days < 186) ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  let jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
  return [jy, jm, jd];
}

function getTodayShamsi() {
  const d = new Date();
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return {
    year: jy,
    month: String(jm).padStart(2, '0'),
    day: String(jd).padStart(2, '0')
  };
}

function getYearMonth(dateStr) {
  if (!dateStr) return { y: 0, m: 0 };
  const clean = toEnglishDigits(dateStr).trim();
  const parts = clean.split(/[\/\.-]/);
  if (parts.length >= 2) {
    return {
      y: parseInt(parts[0], 10) || 0,
      m: parseInt(parts[1], 10) || 0
    };
  }
  return { y: 0, m: 0 };
}

function formatNumberInput(input) {
  let val = toEnglishDigits(input.value).replace(/\D/g, '');
  if (val === '') {
    input.value = '';
    return;
  }
  input.value = Number(val).toLocaleString('en-US');
}

function parseCleanNumber(str) {
  if (!str) return 0;
  const clean = toEnglishDigits(str);
  return Number(String(clean).replace(/,/g, '').replace(/،/g, '').trim()) || 0;
}

const MONTH_NAMES = {
  1: 'فروردین', 2: 'اردیبهشت', 3: 'خرداد', 4: 'تیر', 5: 'مرداد', 6: 'شهریور',
  7: 'مهر', 8: 'آبان', 9: 'آذر', 10: 'دی', 11: 'بهمن', 12: 'اسفند'
};

const CATEGORIES = {
  expense: [
    'خوراک و خرید روزمره',
    'ماشین و حمل‌ونقل',
    'خانه و اقلام منزل',
    'خرج‌های شخصی محمد',
    'خرج‌های شخصی مرضیه',
    'خرج‌های دلارام',
    'اقساط و بدهی‌ها',
    'درمان و سلامت',
    'تفریح و سفر',
    'قبوض و خدمات',
    'هزینه‌های متفرقه'
  ],
  income: [
    'حقوق',
    'اضافه‌کاری',
    'پاداش',
    'درآمد جانبی',
    'سایر درآمدها'
  ]
};

const PERSON_LABELS = {
  me: 'محمد',
  spouse: 'مرضیه',
  daughter: 'دلارام',
  family: 'مشترک'
};

let currentTxType = 'expense';
let dbInstance = null;
let dismissedAlertKeys = [];

let wizardData = {
  person: 'me',
  term: 'short',
  title: '',
  target: 0
};

// پایگاه داده محلی IndexedDB
function initDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('FamilyFinance_DB_FinalSync', 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('transactions')) db.createObjectStore('transactions', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('installments')) db.createObjectStore('installments', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('goals')) db.createObjectStore('goals', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('loans')) db.createObjectStore('loans', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('reminders')) db.createObjectStore('reminders', { keyPath: 'id' });
    };
    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

function getAllData(storeName) {
  return new Promise((resolve) => {
    if (!dbInstance) return resolve([]);
    try {
      const tx = dbInstance.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch (err) {
      resolve([]);
    }
  });
}

function putData(storeName, item) {
  return new Promise((resolve) => {
    if (!dbInstance) return resolve(null);
    try {
      const tx = dbInstance.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (err) {
      resolve(null);
    }
  });
}

function deleteData(storeName, id) {
  return new Promise((resolve) => {
    if (!dbInstance) return resolve();
    try {
      const tx = dbInstance.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.delete(Number(id)).onsuccess = () => resolve();
    } catch (err) {
      resolve();
    }
  });
}

// ارسال خودکار به Google Apps Script
async function triggerBackgroundSync() {
  const url = localStorage.getItem('googleSheetWebhook');
  if (!url) return;

  const bundle = {
    transactions: await getAllData('transactions'),
    installments: await getAllData('installments'),
    goals: await getAllData('goals'),
    loans: await getAllData('loans'),
    reminders: await getAllData('reminders')
  };

  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(bundle)
    });
    
    const dot = document.getElementById('syncStatusDot');
    const txt = document.getElementById('syncStatusText');
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
    if (txt) txt.textContent = 'همگام با سرور ابری';
  } catch (err) {}
}

// دریافت داده‌ها از شیت با JSONP
function executeCloudSync(isUserInitiated = false) {
  const url = localStorage.getItem('googleSheetWebhook');
  if (!url) return;

  const spinner = document.getElementById('fetchCloudSpinner');
  if (spinner) spinner.classList.add('animate-spin');

  const callbackName = 'cloud_cb_' + Date.now();

  window[callbackName] = async function(cloudData) {
    delete window[callbackName];
    const scriptEl = document.getElementById(callbackName);
    if (scriptEl) scriptEl.remove();

    if (cloudData && typeof cloudData === 'object') {
      if (Array.isArray(cloudData.transactions)) {
        for (const t of cloudData.transactions) {
          t.id = Number(t.id);
          t.amount = Number(t.amount) || 0;
          await putData('transactions', t);
        }
      }
      if (Array.isArray(cloudData.installments)) {
        for (const inst of cloudData.installments) {
          inst.id = Number(inst.id);
          inst.monthlyAmount = Number(inst.monthlyAmount) || 0;
          await putData('installments', inst);
        }
      }
      if (Array.isArray(cloudData.goals)) {
        for (const g of cloudData.goals) {
          g.id = Number(g.id);
          await putData('goals', g);
        }
      }
      if (Array.isArray(cloudData.loans)) {
        for (const l of cloudData.loans) {
          l.id = Number(l.id);
          await putData('loans', l);
        }
      }
      if (Array.isArray(cloudData.reminders)) {
        for (const r of cloudData.reminders) {
          r.id = Number(r.id);
          await putData('reminders', r);
        }
      }

      const dot = document.getElementById('syncStatusDot');
      const txt = document.getElementById('syncStatusText');
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
      if (txt) txt.textContent = 'همگام با سرور ابری';

      await renderAll();
      if (isUserInitiated) alert('اطلاعات با موفقیت به‌روز شد.');
    }
    if (spinner) spinner.classList.remove('animate-spin');
  };

  const script = document.createElement('script');
  script.id = callbackName;
  script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + callbackName;
  script.onerror = function() {
    if (spinner) spinner.classList.remove('animate-spin');
  };
  document.body.appendChild(script);
}

// احراز هویت
function checkFamilyAuth() {
  const pinEl = document.getElementById('authPinInput');
  if (!pinEl) return;
  const pinInput = toEnglishDigits(pinEl.value).trim();
  const savedPin = toEnglishDigits(localStorage.getItem('familyPinCode') || '1234').trim();

  if (pinInput === savedPin) {
    document.getElementById('authLockScreen').classList.add('hidden');
    sessionStorage.setItem('isFamilyAuthenticated', 'true');
  } else {
    alert('رمز ورود نادرست است.');
    pinEl.value = '';
    pinEl.focus();
  }
}

function saveNewPin() {
  const newPin = toEnglishDigits(document.getElementById('changePinInput').value).trim();
  if (newPin.length >= 4) {
    localStorage.setItem('familyPinCode', newPin);
    alert('رمز ورود جدید ذخیره شد.');
    document.getElementById('changePinInput').value = '';
  } else {
    alert('رمز باید حداقل ۴ رقم باشد.');
  }
}

function changeDeviceUser(userKey) {
  localStorage.setItem('defaultDeviceUser', userKey);
  const badge = document.getElementById('activeUserBadge');
  if (badge) badge.textContent = PERSON_LABELS[userKey] || 'محمد';
  const personEl = document.getElementById('txPerson');
  if (personEl) personEl.value = userKey;
}

// جابجایی تب‌ها
function switchTab(tabId, scrollToElementId = null) {
  const tabs = ['dashboard', 'transactions', 'reminders', 'archive', 'goals', 'installments', 'settings'];
  tabs.forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) el.classList.add('hidden');
    const btn = document.getElementById(`navBtn-${t}`);
    if (btn) btn.className = 'flex-1 py-1 flex flex-col items-center text-slate-400 hover:text-white transition';
  });

  const target = document.getElementById(`tab-${tabId}`);
  if (target) target.classList.remove('hidden');
  const activeBtn = document.getElementById(`navBtn-${tabId}`);
  if (activeBtn) activeBtn.className = 'flex-1 py-1 flex flex-col items-center text-sky-400 transition';

  if (tabId === 'archive') {
    renderMonthlyArchive();
  }

  if (scrollToElementId) {
    setTimeout(() => {
      const el = document.getElementById(scrollToElementId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function setTxType(type) {
  currentTxType = type;
  const expBtn = document.getElementById('btnTypeExpense');
  const incBtn = document.getElementById('btnTypeIncome');
  if (type === 'expense') {
    expBtn.className = 'h-10 text-xs font-bold rounded-xl bg-rose-500/25 text-rose-300 border border-rose-500/40';
    incBtn.className = 'h-10 text-xs font-bold rounded-xl ultra-glass-card text-slate-300';
  } else {
    incBtn.className = 'h-10 text-xs font-bold rounded-xl bg-emerald-500/25 text-emerald-300 border border-emerald-500/40';
    expBtn.className = 'h-10 text-xs font-bold rounded-xl ultra-glass-card text-slate-300';
  }
  populateCategories();
}

function populateCategories() {
  const cat = document.getElementById('txCategory');
  if (cat) cat.innerHTML = CATEGORIES[currentTxType].map(c => `<option value="${c}">${c}</option>`).join('');
}

// مدیریت تراکنش‌ها
async function handleTxSubmit(e) {
  e.preventDefault();
  const idVal = document.getElementById('txId').value;
  const y = toEnglishDigits(document.getElementById('shamsiYear').value).trim();
  const m = String(toEnglishDigits(document.getElementById('shamsiMonth').value).trim()).padStart(2, '0');
  const d = String(toEnglishDigits(document.getElementById('shamsiDay').value).trim()).padStart(2, '0');
  const shamsiDate = `${y}/${m}/${d}`;

  const cleanAmount = parseCleanNumber(document.getElementById('txAmount').value);
  if (!cleanAmount || cleanAmount <= 0) {
    alert('لطفاً مبلغ معتبری وارد کنید.');
    return;
  }

  const txData = {
    id: idVal ? Number(idVal) : Date.now(),
    amount: cleanAmount,
    type: currentTxType,
    person: document.getElementById('txPerson').value,
    category: document.getElementById('txCategory').value,
    shamsiDate: shamsiDate,
    desc: document.getElementById('txDesc').value.trim()
  };

  await putData('transactions', txData);
  resetTxForm();
  await renderAll();
  triggerBackgroundSync();
}

function editTx(id) {
  getAllData('transactions').then(list => {
    const item = list.find(t => t.id === Number(id));
    if (!item) return;

    document.getElementById('txId').value = item.id;
    document.getElementById('txAmount').value = Number(item.amount).toLocaleString('en-US');
    document.getElementById('txPerson').value = item.person;
    document.getElementById('txDesc').value = item.desc || '';
    setTxType(item.type);
    document.getElementById('txCategory').value = item.category;

    if (item.shamsiDate) {
      const parts = toEnglishDigits(item.shamsiDate).split(/[\/\.-]/);
      if (parts.length === 3) {
        document.getElementById('shamsiYear').value = parts[0];
        document.getElementById('shamsiMonth').value = String(parts[1]).padStart(2, '0');
        document.getElementById('shamsiDay').value = String(parts[2]).padStart(2, '0');
      }
    }

    document.getElementById('txFormTitle').textContent = 'ویرایش تراکنش';
    document.getElementById('btnSubmitTx').textContent = 'بروزرسانی تغییرات';
    document.getElementById('btnCancelEdit').classList.remove('hidden');

    switchTab('transactions');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

async function deleteTx(id) {
  if (confirm('آیا این تراکنش کاملاً حذف شود؟')) {
    await deleteData('transactions', Number(id));
    await renderAll();
    triggerBackgroundSync();
  }
}

function resetTxForm() {
  document.getElementById('txForm').reset();
  document.getElementById('txId').value = '';
  const today = getTodayShamsi();
  document.getElementById('shamsiYear').value = today.year;
  document.getElementById('shamsiMonth').value = today.month;
  document.getElementById('shamsiDay').value = today.day;
  document.getElementById('txFormTitle').textContent = 'ثبت ورودی یا خروجی مالی';
  document.getElementById('btnSubmitTx').textContent = 'ذخیره تراکنش';
  document.getElementById('btnCancelEdit').classList.add('hidden');
  
  const defaultUser = localStorage.getItem('defaultDeviceUser') || 'me';
  document.getElementById('txPerson').value = defaultUser;
  setTxType('expense');
}

// یادآوری‌های مالی
async function handleReminderSubmit(e) {
  e.preventDefault();
  const editId = document.getElementById('reminderEditId').value;
  const title = document.getElementById('reminderTitle').value.trim();
  const cleanAmount = parseCleanNumber(document.getElementById('reminderAmount').value);
  const dueDate = toEnglishDigits(document.getElementById('reminderDueDate').value).trim();

  if (!title || !dueDate) {
    alert('عنوان و تاریخ سررسید الزامی است.');
    return;
  }

  const reminderItem = {
    id: editId ? Number(editId) : Date.now(),
    title,
    amount: cleanAmount,
    dueDate,
    done: false
  };

  await putData('reminders', reminderItem);
  resetReminderForm();
  await renderAll();
  triggerBackgroundSync();
}

function resetReminderForm() {
  document.getElementById('reminderForm').reset();
  document.getElementById('reminderEditId').value = '';
  document.getElementById('reminderFormTitle').innerHTML = '<span>🔔</span> ثبت یادآوری مالی جدید';
  document.getElementById('btnSubmitReminder').textContent = 'ذخیره یادآوری';
  document.getElementById('btnCancelEditReminder').classList.add('hidden');
}

function editReminder(id) {
  getAllData('reminders').then(list => {
    const r = list.find(x => x.id === Number(id));
    if (!r) return;

    document.getElementById('reminderEditId').value = r.id;
    document.getElementById('reminderTitle').value = r.title;
    document.getElementById('reminderAmount').value = r.amount > 0 ? Number(r.amount).toLocaleString('en-US') : '';
    document.getElementById('reminderDueDate').value = r.dueDate;

    document.getElementById('reminderFormTitle').innerHTML = '<span>✏️</span> ویرایش یادآوری مالی';
    document.getElementById('btnSubmitReminder').textContent = 'ذخیره تغییرات یادآوری';
    document.getElementById('btnCancelEditReminder').classList.remove('hidden');

    switchTab('reminders');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

async function toggleReminderDone(id) {
  const list = await getAllData('reminders');
  const r = list.find(x => x.id === Number(id));
  if (r) {
    r.done = !r.done;
    await putData('reminders', r);
    await renderAll();
    triggerBackgroundSync();
  }
}

async function deleteReminder(id) {
  if (confirm('آیا این یادآوری مالی حذف شود؟')) {
    await deleteData('reminders', Number(id));
    await renderAll();
    triggerBackgroundSync();
  }
}

// اقساط و ثبت رسید/شناسه پرداخت
function calculateDueDate(startYear, startMonth, dueDay, installmentIndex) {
  let m = startMonth + (installmentIndex - 1);
  let y = startYear;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return `${y}/${String(m).padStart(2, '0')}/${String(dueDay).padStart(2, '0')}`;
}

function compareShamsiDates(date1, date2) {
  if (!date1 || !date2) return 0;
  const d1 = toEnglishDigits(String(date1)).replace(/[\/\.-]/g, '');
  const d2 = toEnglishDigits(String(date2)).replace(/[\/\.-]/g, '');
  return Number(d1) - Number(d2);
}

async function handleInstSubmit(e) {
  e.preventDefault();
  try {
    const editId = document.getElementById('instEditId').value;
    const startYear = Number(toEnglishDigits(document.getElementById('instStartYear').value)) || Number(getTodayShamsi().year);
    const startMonth = Number(toEnglishDigits(document.getElementById('instStartMonth').value)) || Number(getTodayShamsi().month);
    const dueDay = Number(toEnglishDigits(document.getElementById('instDueDay').value));
    const totalMonths = Number(toEnglishDigits(document.getElementById('instTotalMonths').value));
    const monthlyAmount = parseCleanNumber(document.getElementById('instMonthlyAmount').value);
    const title = document.getElementById('instTitle').value.trim();
    const person = document.getElementById('instPerson').value;

    if (!title || !monthlyAmount || !dueDay || !totalMonths) {
      alert('لطفاً فیلدها را کامل وارد کنید.');
      return;
    }

    let schedule = [];
    let paidMonths = 0;

    if (editId) {
      const allInst = await getAllData('installments');
      const prev = allInst.find(x => x.id === Number(editId));
      if (prev && prev.schedule) {
        paidMonths = prev.paidMonths;
        schedule = prev.schedule;
      }
    }

    if (schedule.length === 0) {
      for (let i = 1; i <= totalMonths; i++) {
        schedule.push({
          index: i,
          dueDate: calculateDueDate(startYear, startMonth, dueDay, i),
          isPaid: i <= paidMonths,
          paidDate: i <= paidMonths ? getTodayShamsi().year + "/" + getTodayShamsi().month : null,
          receipt: ''
        });
      }
    }

    const inst = {
      id: editId ? Number(editId) : Date.now(),
      title,
      monthlyAmount,
      dueDay,
      totalMonths,
      paidMonths,
      person,
      startYear,
      startMonth,
      schedule
    };

    await putData('installments', inst);
    resetInstForm();
    await renderAll();
    triggerBackgroundSync();
  } catch (err) {
    alert('خطا: ' + err.message);
  }
}

function resetInstForm() {
  document.getElementById('instForm').reset();
  document.getElementById('instEditId').value = '';
  document.getElementById('instStartYear').value = getTodayShamsi().year;
  document.getElementById('instStartMonth').value = Number(getTodayShamsi().month);
  document.getElementById('instFormTitle').textContent = 'افزودن قسط و تسهیلات جدید';
  document.getElementById('btnSubmitInst').textContent = 'تولید جدول سررسید اقساط و ثبت تقویمی';
  document.getElementById('btnCancelEditInst').classList.add('hidden');
}

async function paySpecificInstallment(instId, instIndex) {
  const installments = await getAllData('installments');
  const item = installments.find(i => i.id === Number(instId));
  if (!item || !item.schedule) return;

  const targetInst = item.schedule.find(s => s.index === instIndex);
  if (!targetInst || targetInst.isPaid) return;

  const receiptRef = prompt(`ثبت پرداخت قسط ${instIndex} (${item.title})\nشماره پیگیری فیش / شناسه رسید را وارد کنید (اختیاری):`, '');
  if (receiptRef === null) return;

  const today = getTodayShamsi();
  const todayStr = `${today.year}/${today.month}/${today.day}`;

  targetInst.isPaid = true;
  targetInst.paidDate = todayStr;
  targetInst.receipt = receiptRef.trim() || 'ثبت دستی';
  item.paidMonths = item.schedule.filter(s => s.isPaid).length;

  await putData('installments', item);

  const tx = {
    id: Date.now(),
    amount: item.monthlyAmount,
    type: 'expense',
    person: item.person,
    category: 'اقساط و بدهی‌ها',
    shamsiDate: todayStr,
    desc: `پرداخت قسط ${instIndex} از ${item.title} (رسید: ${targetInst.receipt})`
  };
  await putData('transactions', tx);
  await renderAll();
  triggerBackgroundSync();
}

// اهداف مالی
function startNewGoalWizard() {
  document.getElementById('wizardEditGoalId').value = '';
  document.getElementById('goalWizardContainer').classList.remove('hidden');
  backToStep(1);
}

function cancelGoalWizard() {
  document.getElementById('goalWizardContainer').classList.add('hidden');
}

function chooseWizardPerson(person) {
  wizardData.person = person;
  document.getElementById('wizardStep1').classList.add('hidden');
  const step2 = document.getElementById('wizardStep2');
  step2.classList.remove('hidden');
  step2.classList.add('fade-step-enter');
}

function chooseWizardTerm(term) {
  wizardData.term = term;
  document.getElementById('wizardStep2').classList.add('hidden');
  const step3 = document.getElementById('wizardStep3');
  step3.classList.remove('hidden');
  step3.classList.add('fade-step-enter');
}

function backToStep(stepNumber) {
  document.getElementById('wizardStep1').classList.add('hidden');
  document.getElementById('wizardStep2').classList.add('hidden');
  document.getElementById('wizardStep3').classList.add('hidden');
  const target = document.getElementById(`wizardStep${stepNumber}`);
  target.classList.remove('hidden');
  target.classList.add('fade-step-enter');
}

async function commitWizardGoal() {
  const editId = document.getElementById('wizardEditGoalId').value;
  const title = document.getElementById('wizardGoalTitle').value.trim();
  const cleanTarget = parseCleanNumber(document.getElementById('wizardGoalTargetAmount').value);
  if (!title || !cleanTarget) {
    alert('لطفاً عنوان و مبلغ هدف را وارد کنید.');
    return;
  }

  const today = getTodayShamsi();
  let currentVal = 0;
  let historyVal = [];

  if (editId) {
    const goals = await getAllData('goals');
    const prev = goals.find(g => g.id === Number(editId));
    if (prev) {
      currentVal = prev.current;
      historyVal = prev.history || [];
    }
  }

  const goalObj = {
    id: editId ? Number(editId) : Date.now(),
    title: title,
    target: cleanTarget,
    current: currentVal,
    person: wizardData.person,
    term: wizardData.term,
    achieved: currentVal >= cleanTarget,
    history: historyVal,
    createdDate: `${today.year}/${today.month}/${today.day}`
  };

  await putData('goals', goalObj);
  cancelGoalWizard();
  await renderAll();
  triggerBackgroundSync();
}

async function deleteGoal(id) {
  if (confirm('آیا این هدف مالی کاملاً حذف شود؟')) {
    await deleteData('goals', Number(id));
    await renderAll();
    triggerBackgroundSync();
  }
}

// قرض‌ها
function openLoanModal() {
  document.getElementById('loanEditId').value = '';
  document.getElementById('loanLender').value = '';
  document.getElementById('loanAmount').value = '';
  document.getElementById('loanModalTitle').textContent = 'ثبت قرض / بدهی';
  const today = getTodayShamsi();
  document.getElementById('loanTakenDate').value = `${today.year}/${today.month}/${today.day}`;
  document.getElementById('loanDueDate').value = '';
  document.getElementById('loanModal').classList.remove('hidden');
}
function closeLoanModal() {
  document.getElementById('loanModal').classList.add('hidden');
}

async function saveLoan() {
  const editId = document.getElementById('loanEditId').value;
  const lender = document.getElementById('loanLender').value.trim();
  const cleanAmount = parseCleanNumber(document.getElementById('loanAmount').value);
  const takenDate = toEnglishDigits(document.getElementById('loanTakenDate').value).trim();
  const dueDate = toEnglishDigits(document.getElementById('loanDueDate').value).trim();
  if (!lender || !cleanAmount) return;

  const loanItem = {
    id: editId ? Number(editId) : Date.now(),
    lender,
    amount: cleanAmount,
    takenDate,
    dueDate,
    paid: false
  };

  await putData('loans', loanItem);
  closeLoanModal();
  await renderAll();
  triggerBackgroundSync();
}

async function deleteLoan(id) {
  if (confirm('آیا این قرض کاملاً حذف شود؟')) {
    await deleteData('loans', Number(id));
    await renderAll();
    triggerBackgroundSync();
  }
}

async function payLoan(id) {
  if (confirm('آیا این قرض تسویه شد؟')) {
    const loans = await getAllData('loans');
    const l = loans.find(x => x.id === Number(id));
    if (l) {
      l.paid = true;
      await putData('loans', l);
      await renderAll();
      triggerBackgroundSync();
    }
  }
}

// پیامک بانک
function openSmsModal() {
  document.getElementById('smsRawText').value = '';
  document.getElementById('smsReviewArea').classList.add('hidden');
  document.getElementById('smsModal').classList.remove('hidden');
}
function closeSmsModal() {
  document.getElementById('smsModal').classList.add('hidden');
}

function analyzeSmsText() {
  const text = document.getElementById('smsRawText').value.trim();
  if (!text) return;

  let amount = 0;
  const cleanDigits = toEnglishDigits(text).replace(/,/g, '').replace(/،/g, '');
  const matchAmount = cleanDigits.match(/(?:مبلغ|مبلغ:|به مبلغ)\s*([0-9]+)/) || cleanDigits.match(/([0-9]+)\s*(?:ریال|تومان)/);
  if (matchAmount && matchAmount[1]) {
    amount = Number(matchAmount[1]);
    if (text.includes('ریال')) amount = Math.floor(amount / 10);
  }

  const isIncome = text.includes('واریز') || text.includes('انتقال به');
  const detectedType = isIncome ? 'income' : 'expense';

  const today = getTodayShamsi();
  let extractedDate = `${today.year}/${today.month}/${today.day}`;
  const engText = toEnglishDigits(text);
  const matchDate = engText.match(/(140\d[\/\.-]\d{1,2}[\/\.-]\d{1,2})/);

  if (matchDate) {
    const parts = matchDate[1].split(/[\/\.-]/);
    extractedDate = `${parts[0]}/${String(parts[1]).padStart(2, '0')}/${String(parts[2]).padStart(2, '0')}`;
  }

  let matchedCategory = detectedType === 'expense' ? 'خوراک و خرید روزمره' : 'سایر درآمدها';
  if (/بنزین|سوخت|تاکسی|اسنپ|تپسی/.test(text)) matchedCategory = 'ماشین و حمل‌ونقل';
  else if (/دارو|درمانگاه|بیمارستان|دکتر/.test(text)) matchedCategory = 'درمان و سلامت';
  else if (/سوپر|هایپر|نان|گوشت|میوه/.test(text)) matchedCategory = 'خوراک و خرید روزمره';
  else if (/حقوق|دستمزد|پایا/.test(text)) matchedCategory = 'حقوق';
  else if (/قسط|تسهیلات|وام/.test(text)) matchedCategory = 'اقساط و بدهی‌ها';

  document.getElementById('smsParsedType').value = detectedType;
  document.getElementById('smsParsedAmount').value = amount > 0 ? amount.toLocaleString('en-US') : '';
  document.getElementById('smsParsedDate').value = extractedDate;
  document.getElementById('smsParsedPerson').value = localStorage.getItem('defaultDeviceUser') || 'me';

  const catSelect = document.getElementById('smsParsedCategory');
  catSelect.innerHTML = CATEGORIES[detectedType].map(c => `<option value="${c}">${c}</option>`).join('');
  catSelect.value = matchedCategory;

  document.getElementById('smsParsedDesc').value = text.slice(0, 50);
  document.getElementById('smsReviewArea').classList.remove('hidden');
}

async function commitSmsTransaction() {
  const cleanAmount = parseCleanNumber(document.getElementById('smsParsedAmount').value);
  if (!cleanAmount) return;

  const txData = {
    id: Date.now(),
    amount: cleanAmount,
    type: document.getElementById('smsParsedType').value,
    person: document.getElementById('smsParsedPerson').value,
    category: document.getElementById('smsParsedCategory').value,
    shamsiDate: toEnglishDigits(document.getElementById('smsParsedDate').value).trim(),
    desc: document.getElementById('smsParsedDesc').value.trim()
  };

  await putData('transactions', txData);
  closeSmsModal();
  await renderAll();
  triggerBackgroundSync();
}

function dismissAlert(alertKey, event) {
  if (event) event.stopPropagation();
  dismissedAlertKeys.push(alertKey);
  renderAll();
}

function toToman(num) {
  return new Intl.NumberFormat('fa-IR').format(num) + ' تومان';
}

// موتور رندر اصلی
async function renderAll() {
  const transactions = await getAllData('transactions');
  const installments = await getAllData('installments');
  const goals = await getAllData('goals');
  const loans = await getAllData('loans');
  const reminders = await getAllData('reminders');
  const today = getTodayShamsi();
  const curY = parseInt(today.year, 10);
  const curM = parseInt(today.month, 10);
  const todayDateStr = `${today.year}/${today.month}/${today.day}`;

  // ۱. محاسبه مانده نقدینگی کل (تجمعی از تمام تراکنش‌ها)
  let allTimeIncome = 0;
  let allTimeExpense = 0;
  let curMonthIncome = 0;
  let curMonthExpense = 0;
  let incMe = 0, incSpouse = 0;
  let expDaughter = 0, expFamily = 0;

  transactions.forEach(t => {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') {
      allTimeIncome += amt;
    } else {
      allTimeExpense += amt;
    }

    const dt = getYearMonth(t.shamsiDate);
    if (dt.y === curY && dt.m === curM) {
      if (t.type === 'income') {
        curMonthIncome += amt;
        if (t.person === 'me') incMe += amt;
        if (t.person === 'spouse') incSpouse += amt;
      } else {
        curMonthExpense += amt;
        if (t.person === 'daughter') expDaughter += amt;
        if (t.person === 'family') expFamily += amt;
      }
    }
  });

  const totalCashBalance = allTimeIncome - allTimeExpense;

  const elNet = document.getElementById('dashNetBalance');
  const elInc = document.getElementById('dashTotalIncome');
  const elExp = document.getElementById('dashTotalExpense');

  if (elNet) elNet.textContent = toToman(totalCashBalance);
  if (elInc) elInc.textContent = toToman(curMonthIncome);
  if (elExp) elExp.textContent = toToman(curMonthExpense);

  const elMe = document.getElementById('dashIncomeMe');
  const elSpouse = document.getElementById('dashIncomeSpouse');
  const elDaughter = document.getElementById('dashDaughterExpense');
  const elFamily = document.getElementById('dashFamilyExpense');

  if (elMe) elMe.textContent = toToman(incMe);
  if (elSpouse) elSpouse.textContent = toToman(incSpouse);
  if (elDaughter) elDaughter.textContent = toToman(expDaughter);
  if (elFamily) elFamily.textContent = toToman(expFamily);

  // ۲. کنترل اقساط ماه جاری
  let currentMonthInstallmentTotal = 0;
  let currentMonthInstallmentCount = 0;
  const overdueAlerts = [];
  const nearAlerts = [];

  installments.forEach(inst => {
    if (inst.schedule) {
      inst.schedule.forEach(s => {
        const sDt = getYearMonth(s.dueDate);
        if (sDt.y === curY && sDt.m === curM && !s.isPaid) {
          currentMonthInstallmentTotal += (Number(inst.monthlyAmount) || 0);
          currentMonthInstallmentCount += 1;
        }

        if (!s.isPaid) {
          const cmp = compareShamsiDates(s.dueDate, todayDateStr);
          const alertKey = `inst_${inst.id}_${s.index}`;

          if (!dismissedAlertKeys.includes(alertKey)) {
            if (cmp < 0) {
              overdueAlerts.push({
                key: alertKey,
                msg: `⚠️ قسط ${s.index} از «${inst.title}» موعد ${s.dueDate} پرداخت نشده است!`,
                elementId: `instCard_${inst.id}`
              });
            } else if (cmp <= 5 && cmp >= 0) {
              nearAlerts.push({
                key: alertKey,
                msg: `موعد قسط ${s.index} از «${inst.title}» (${s.dueDate}) نزدیک است!`,
                elementId: `instCard_${inst.id}`
              });
            }
          }
        }
      });
    }
  });

  const elInstTot = document.getElementById('dashMonthInstallmentTotal');
  const elInstCount = document.getElementById('dashMonthInstallmentCount');
  if (elInstTot) elInstTot.textContent = toToman(currentMonthInstallmentTotal);
  if (elInstCount) elInstCount.textContent = `${currentMonthInstallmentCount} قسط`;

  const overdueBox = document.getElementById('overdueAlertsContainer');
  if (overdueBox) {
    if (overdueAlerts.length > 0) {
      overdueBox.classList.remove('hidden');
      overdueBox.innerHTML = overdueAlerts.map(item => `
        <div onclick="switchTab('installments', '${item.elementId}')" class="ultra-glass p-3 rounded-2xl border-rose-500/50 bg-rose-500/15 text-rose-300 text-xs font-bold flex items-center justify-between cursor-pointer">
          <div class="flex items-center gap-2"><span>🚨</span><span>${item.msg}</span></div>
          <button onclick="dismissAlert('${item.key}', event)" class="text-rose-400 px-2">✕</button>
        </div>
      `).join('');
    } else {
      overdueBox.classList.add('hidden');
    }
  }

  const nearBox = document.getElementById('installmentAlertsContainer');
  const dueBadge = document.getElementById('dueBadge');
  if (nearBox) {
    if (nearAlerts.length > 0) {
      nearBox.classList.remove('hidden');
      if (dueBadge) dueBadge.classList.remove('hidden');
      nearBox.innerHTML = nearAlerts.map(item => `
        <div onclick="switchTab('installments', '${item.elementId}')" class="ultra-glass-card p-3 rounded-2xl border-amber-500/40 bg-amber-500/10 flex items-center justify-between text-xs cursor-pointer">
          <div class="flex items-center gap-2 text-amber-200"><span>🔔</span><span>${item.msg}</span></div>
          <button onclick="dismissAlert('${item.key}', event)" class="text-amber-400 px-2">✕</button>
        </div>
      `).join('');
    } else {
      nearBox.classList.add('hidden');
      if (dueBadge) dueBadge.classList.add('hidden');
    }
  }

  // ۳. یادآوری‌ها بدون نمایش در صفحه اصلی (فقط نشانگر در نوار پایین و صفحه خود یادآوری)
  const activeReminders = reminders.filter(r => !r.done);
  const reminderNavBadge = document.getElementById('reminderBadge');
  if (reminderNavBadge) {
    if (activeReminders.length > 0) reminderNavBadge.classList.remove('hidden');
    else reminderNavBadge.classList.add('hidden');
  }

  const remindersContainer = document.getElementById('remindersContainer');
  if (remindersContainer) {
    if (reminders.length === 0) {
      remindersContainer.innerHTML = '<div class="text-[11px] text-slate-400 py-3 text-center">هیچ یادآوری ثبت نشده است.</div>';
    } else {
      remindersContainer.innerHTML = reminders.map(r => `
        <div class="ultra-glass-card p-3 rounded-2xl flex items-center justify-between text-xs ${r.done ? 'opacity-60 bg-emerald-950/20' : ''}">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-bold ${r.done ? 'line-through text-slate-400' : 'text-white'}">${r.title}</span>
              ${r.amount > 0 ? `<span class="text-[10px] text-sky-300 font-mono">(${toToman(r.amount)})</span>` : ''}
            </div>
            <div class="text-[10px] text-slate-400 mt-0.5">موعد: ${r.dueDate}</div>
          </div>
          <div class="flex items-center gap-1.5">
            <button onclick="toggleReminderDone(${r.id})" class="px-2 py-1 rounded-lg text-[10px] font-bold ${r.done ? 'bg-slate-700 text-slate-300' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}">
              ${r.done ? 'تکمیل شده ✓' : 'علامت انجام'}
            </button>
            <button onclick="editReminder(${r.id})" class="text-sky-300 px-1 text-xs">✏️</button>
            <button onclick="deleteReminder(${r.id})" class="text-rose-400 px-1 text-xs">🗑️</button>
          </div>
        </div>
      `).join('');
    }
  }

  // ۴. لیست تراکنش‌ها
  const filterP = document.getElementById('filterPerson') ? document.getElementById('filterPerson').value : 'all';
  const filteredTx = transactions
    .filter(t => filterP === 'all' || t.person === filterP)
    .sort((a, b) => (b.id || 0) - (a.id || 0));

  const cardsContainer = document.getElementById('txCardsContainer');
  const empty = document.getElementById('txEmptyMsg');
  if (cardsContainer) {
    if (filteredTx.length === 0) {
      cardsContainer.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
    } else {
      if (empty) empty.classList.add('hidden');
      cardsContainer.innerHTML = filteredTx.map(t => {
        const isInc = t.type === 'income';
        return `
          <div class="ultra-glass-card p-3 rounded-2xl flex items-center justify-between text-xs">
            <div class="space-y-0.5">
              <div class="flex items-center gap-1.5">
                <span class="font-bold text-white">${t.category}</span>
                <span class="text-[9px] px-1.5 py-0.2 rounded ${isInc ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}">
                  ${PERSON_LABELS[t.person]}
                </span>
              </div>
              <div class="text-[10px] text-slate-400">${t.shamsiDate} ${t.desc ? `• ${t.desc}` : ''}</div>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-extrabold font-mono ${isInc ? 'text-emerald-400' : 'text-rose-400'}" dir="ltr">
                ${new Intl.NumberFormat('fa-IR').format(t.amount)}
              </span>
              <button onclick="editTx(${t.id})" class="text-sky-400 text-xs px-1">✏️</button>
              <button onclick="deleteTx(${t.id})" class="text-rose-400 text-xs px-1">🗑️</button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // ۵. جدول اقساط و نمایش فیش/رسید
  const instGrid = document.getElementById('installmentsGrid');
  if (instGrid) {
    instGrid.innerHTML = installments.map(inst => {
      const left = inst.totalMonths - (inst.paidMonths || 0);
      let linesHtml = '';
      if (inst.schedule) {
        inst.schedule.forEach(s => {
          const isPast = compareShamsiDates(s.dueDate, todayDateStr) < 0;
          let badgeClass = 'bg-white/5 text-slate-400 border border-white/5';
          let statusText = `در انتظار موعد (${s.dueDate})`;

          if (s.isPaid) {
            badgeClass = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold';
            statusText = `✓ پرداخت شد ${s.receipt ? `(رسید: ${s.receipt})` : ''}`;
          } else if (isPast) {
            badgeClass = 'bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold';
            statusText = `🚨 معوقه (${s.dueDate})`;
          }

          linesHtml += `
            <div class="flex items-center justify-between p-2 rounded-xl text-[10px] ${badgeClass}">
              <div class="flex items-center gap-1.5">
                <span class="font-bold">قسط ${s.index}</span>
                <span class="text-[9px] opacity-75 font-mono">| ${s.dueDate}</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span>${statusText}</span>
                ${!s.isPaid ? `
                  <button onclick="paySpecificInstallment(${inst.id},${s.index})" class="px-2 py-0.5 bg-sky-500 hover:bg-sky-400 text-white rounded-lg text-[9px] font-bold">
                    پرداخت و ثبت رسید
                  </button>
                ` : ''}
              </div>
            </div>
          `;
        });
      }

      return `
        <div id="instCard_${inst.id}" class="ultra-glass p-3.5 rounded-2xl space-y-2 border border-white/5">
          <div class="flex justify-between items-start">
            <div>
              <h4 class="font-bold text-white text-xs">${inst.title}</h4>
              <div class="text-[10px] text-slate-400">سررسید: ${inst.dueDay} هر ماه • ${PERSON_LABELS[inst.person]}</div>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="text-[9px] px-2 py-0.5 rounded-lg ${left === 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}">
                ${left === 0 ? 'تسویه کامل' : `${left} قسط مانده`}
              </span>
            </div>
          </div>
          <div class="text-xs font-bold text-white pt-1">
            مبلغ هر قسط: ${toToman(inst.monthlyAmount)}
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-2 border-t border-white/5 max-h-48 overflow-y-auto no-scrollbar">
            ${linesHtml}
          </div>
        </div>
      `;
    }).join('');
  }

  // ۶. قرض‌ها
  const loansContainer = document.getElementById('loansContainer');
  if (loansContainer) {
    const activeLoans = loans.filter(l => !l.paid);
    if (activeLoans.length === 0) {
      loansContainer.innerHTML = '<div class="text-[11px] text-slate-400">قرض فعالی ثبت نشده است.</div>';
    } else {
      loansContainer.innerHTML = activeLoans.map(l => `
        <div class="ultra-glass-card p-3 rounded-2xl flex justify-between items-center text-xs">
          <div>
            <div class="font-bold text-white">${l.lender}</div>
            <div class="text-[10px] text-slate-400">دریافت: ${l.takenDate} ${l.dueDate ? `• سررسید: ${l.dueDate}` : ''}</div>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="font-bold text-amber-300 font-mono">${toToman(l.amount)}</span>
            <button onclick="deleteLoan(${l.id})" class="text-rose-400 text-xs px-1">🗑️</button>
            <button onclick="payLoan(${l.id})" class="px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded-lg text-[10px]">تسویه شد</button>
          </div>
        </div>
      `).join('');
    }
  }

  // ۷. اهداف
  const goalsGrid = document.getElementById('savingGoalsContainer');
  if (goalsGrid) {
    const activeGoals = goals.filter(g => !g.achieved);
    if (activeGoals.length === 0) {
      goalsGrid.innerHTML = '<div class="col-span-full text-[11px] text-slate-400 py-4 text-center">هدف فعالی نیست.</div>';
    } else {
      goalsGrid.innerHTML = activeGoals.map(g => {
        const pct = Math.min(100, Math.round((g.current / g.target) * 100));
        return `
          <div class="ultra-glass-card p-3.5 rounded-2xl space-y-2 border border-white/5">
            <div class="flex justify-between items-start text-xs">
              <span class="font-bold text-white">${g.title} (${PERSON_LABELS[g.person]})</span>
              <button onclick="deleteGoal(${g.id})" class="text-rose-400 text-xs">🗑️</button>
            </div>
            <div class="w-full bg-white/5 rounded-full h-2 overflow-hidden">
              <div class="bg-gradient-to-r from-sky-400 to-indigo-500 h-2 rounded-full" style="width: ${pct}%"></div>
            </div>
            <div class="flex justify-between text-[10px] text-slate-300">
              <span>هدف: ${toToman(g.target)}</span>
              <span class="text-sky-300">${pct}٪</span>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

// سیستم بایگانی ماهانه و تولید صورت وضعیت PDF
async function renderMonthlyArchive() {
  const container = document.getElementById('monthlyArchiveList');
  if (!container) return;

  const transactions = await getAllData('transactions');
  const monthMap = {};

  transactions.forEach(t => {
    const dt = getYearMonth(t.shamsiDate);
    if (dt.y > 0 && dt.m > 0) {
      const key = `${dt.y}/${String(dt.m).padStart(2, '0')}`;
      if (!monthMap[key]) {
        monthMap[key] = { year: dt.y, month: dt.m, income: 0, expense: 0, count: 0 };
      }
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') monthMap[key].income += amt;
      else monthMap[key].expense += amt;
      monthMap[key].count++;
    }
  });

  const sortedMonths = Object.keys(monthMap).sort().reverse();

  if (sortedMonths.length === 0) {
    container.innerHTML = '<div class="text-slate-400 text-xs text-center py-6">هنوز هیچ ماهی ثبت اطلاعات نشده است.</div>';
    return;
  }

  container.innerHTML = sortedMonths.map(key => {
    const m = monthMap[key];
    const mName = MONTH_NAMES[m.month] || `ماه ${m.month}`;
    const balance = m.income - m.expense;

    return `
      <div class="ultra-glass-card p-3.5 rounded-2xl flex items-center justify-between">
        <div>
          <div class="font-bold text-white text-xs">گزارش مالی ${mName} ${m.year}</div>
          <div class="text-[10px] text-slate-400 mt-1">
            درآمد: <span class="text-emerald-400 font-mono">${new Intl.NumberFormat('fa-IR').format(m.income)}</span> |
            مخارج: <span class="text-rose-400 font-mono">${new Intl.NumberFormat('fa-IR').format(m.expense)}</span> |
            تراز: <span class="text-sky-300 font-mono">${new Intl.NumberFormat('fa-IR').format(balance)}</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="printMonthReport(${m.year}, ${m.month})" class="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-md">
            <span>📄</span>
            <span>مشاهده و خروجی PDF</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// چاپ و تولید صورت وضعیت PDF ماه درخواستی
async function printMonthReport(year, month) {
  const transactions = await getAllData('transactions');
  const installments = await getAllData('installments');
  const mName = MONTH_NAMES[month] || `ماه ${month}`;
  
  let inc = 0, exp = 0;
  const monthTx = transactions.filter(t => {
    const dt = getYearMonth(t.shamsiDate);
    return dt.y === year && dt.m === month;
  });

  monthTx.forEach(t => {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') inc += amt;
    else exp += amt;
  });

  // جمع‌آوری اقساط پرداخت‌شده در این ماه با شناسه فیش
  let paidInstRows = '';
  installments.forEach(inst => {
    if (inst.schedule) {
      inst.schedule.forEach(s => {
        if (s.isPaid && s.paidDate) {
          const pDt = getYearMonth(s.paidDate);
          if (pDt.y === year && pDt.m === month) {
            paidInstRows += `
              <tr>
                <td style="border:1px solid #ddd; padding:6px; text-align:center;">${inst.title}</td>
                <td style="border:1px solid #ddd; padding:6px; text-align:center;">قسط شماره ${s.index}</td>
                <td style="border:1px solid #ddd; padding:6px; text-align:center;">${s.paidDate}</td>
                <td style="border:1px solid #ddd; padding:6px; text-align:center; font-family:monospace; font-weight:bold;">${s.receipt || 'ندارد'}</td>
                <td style="border:1px solid #ddd; padding:6px; text-align:left;">${new Intl.NumberFormat('fa-IR').format(inst.monthlyAmount)} تومان</td>
              </tr>
            `;
          }
        }
      });
    }
  });

  let tableRows = '';
  monthTx.forEach((t, idx) => {
    tableRows += `
      <tr>
        <td style="border:1px solid #ddd; padding:6px; text-align:center;">${idx + 1}</td>
        <td style="border:1px solid #ddd; padding:6px; text-align:center;">${t.shamsiDate}</td>
        <td style="border:1px solid #ddd; padding:6px; text-align:center;">${PERSON_LABELS[t.person]}</td>
        <td style="border:1px solid #ddd; padding:6px;">${t.category}</td>
        <td style="border:1px solid #ddd; padding:6px;">${t.desc || '-'}</td>
        <td style="border:1px solid #ddd; padding:6px; text-align:left; font-weight:bold; color:${t.type === 'income' ? '#047857' : '#b91c1c'};">${new Intl.NumberFormat('fa-IR').format(t.amount)}</td>
      </tr>
    `;
  });

  const fullHtml = `
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>گزارش مالی ${mName} ${year}</title>
      <style>
        body { font-family: Tahoma, 'Vazirmatn', sans-serif; padding: 25px; color: #111; direction: rtl; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px; }
        .boxes { display: flex; gap: 12px; margin-bottom: 24px; }
        .box { flex: 1; border: 1px solid #cbd5e1; padding: 12px; border-radius: 8px; text-align: center; background: #f8fafc; font-size:13px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; margin-bottom: 25px; }
        th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px; text-align:center; }
        h3 { font-size: 13px; margin-bottom: 6px; color:#1e293b; border-right: 3px solid #2563eb; padding-right: 8px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h2 style="margin:0 0 5px 0;">صورت وضعیت مالی خانواده</h2>
          <p style="margin:0; font-size:13px; color:#475569;">بایگانی عملکرد ماهانه: ${mName} ${year}</p>
        </div>
        <div style="font-size:12px; text-align:left;">تاریخ چاپ: ${getTodayShamsi().year}/${getTodayShamsi().month}/${getTodayShamsi().day}</div>
      </div>

      <div class="boxes">
        <div class="box">درآمد کل این ماه<br><b style="color:#047857; font-size:15px;">${toToman(inc)}</b></div>
        <div class="box">کل مخارج این ماه<br><b style="color:#b91c1c; font-size:15px;">${toToman(exp)}</b></div>
        <div class="box">تراز عملکرد ماهانه<br><b style="color:#0284c7; font-size:15px;">${toToman(inc - exp)}</b></div>
      </div>

      ${paidInstRows ? `
        <h3>اقساط پرداخت‌شده در این ماه همراه با شناسه رسید</h3>
        <table>
          <thead>
            <tr><th>عنوان تسهیلات</th><th>شماره قسط</th><th>تاریخ پرداخت</th><th>کد پیگیری / شناسه فیش</th><th>مبلغ</th></tr>
          </thead>
          <tbody>${paidInstRows}</tbody>
        </table>
      ` : ''}

      <h3>ریز تراکنش‌های ماهانه</h3>
      <table>
        <thead>
          <tr><th>ردیف</th><th>تاریخ</th><th>عضو</th><th>دسته‌بندی</th><th>شرح</th><th>مبلغ (تومان)</th></tr>
        </thead>
        <tbody>${tableRows || '<tr><td colspan="6" style="text-align:center; padding:10px;">هیچ تراکنشی ثبت نشده است.</td></tr>'}</tbody>
      </table>
    </body>
    </html>
  `;

  printDirectHtml(fullHtml);
}

function printDirectHtml(contentHtml) {
  let printFrame = document.getElementById('directPrintIframe');
  if (!printFrame) {
    printFrame = document.createElement('iframe');
    printFrame.id = 'directPrintIframe';
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = 'none';
    document.body.appendChild(printFrame);
  }

  const frameDoc = printFrame.contentWindow.document;
  frameDoc.open();
  frameDoc.write(contentHtml);
  frameDoc.close();

  setTimeout(() => {
    printFrame.contentWindow.focus();
    printFrame.contentWindow.print();
  }, 400);
}

function saveSheetSettings() {
  const url = document.getElementById('sheetWebhookUrl').value.trim();
  localStorage.setItem('googleSheetWebhook', url);
  alert('پیوند Google Sheets ذخیره شد.');
  executeCloudSync(true);
}

// راه‌اندازی
window.addEventListener('DOMContentLoaded', async () => {
  await initDatabase();

  const pinInputEl = document.getElementById('authPinInput');
  if (pinInputEl) {
    pinInputEl.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') checkFamilyAuth();
    });
  }

  if (sessionStorage.getItem('isFamilyAuthenticated') === 'true') {
    const lock = document.getElementById('authLockScreen');
    if (lock) lock.classList.add('hidden');
  }

  const savedUrl = localStorage.getItem('googleSheetWebhook');
  if (savedUrl) {
    const sheetUrlInp = document.getElementById('sheetWebhookUrl');
    if (sheetUrlInp) sheetUrlInp.value = savedUrl;
  }

  const today = getTodayShamsi();
  if (document.getElementById('shamsiYear')) document.getElementById('shamsiYear').value = today.year;
  if (document.getElementById('shamsiMonth')) document.getElementById('shamsiMonth').value = today.month;
  if (document.getElementById('shamsiDay')) document.getElementById('shamsiDay').value = today.day;

  const instYearInp = document.getElementById('instStartYear');
  if (instYearInp) instYearInp.value = today.year;
  const instMonthInp = document.getElementById('instStartMonth');
  if (instMonthInp) instMonthInp.value = Number(today.month);

  const defaultUser = localStorage.getItem('defaultDeviceUser') || 'me';
  if (document.getElementById('deviceUserSelect')) document.getElementById('deviceUserSelect').value = defaultUser;
  if (document.getElementById('activeUserBadge')) document.getElementById('activeUserBadge').textContent = PERSON_LABELS[defaultUser] || 'محمد';
  if (document.getElementById('txPerson')) document.getElementById('txPerson').value = defaultUser;

  populateCategories();
  await renderAll();

  setTimeout(() => {
    executeCloudSync(false);
  }, 1000);

  setInterval(() => {
    executeCloudSync(false);
  }, 30000);
});
// ثبت سرویس ورکر برای فعال‌سازی قابلیت نصب خودکار (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('PWA ServiceWorker فعال شد:', reg.scope))
      .catch(err => console.error('خطا در سرویس‌ورکر:', err));
  });
}
