const STORAGE_KEY = "med-helper-v3";
const BACKUP_STORAGE_KEY = "med-helper-v3-backup";
const MEDS_BACKUP_KEY = "med-helper-meds-v1";
const RECOVERY_SNAPSHOT_KEY = "med-helper-recovery-v1";
const LEGACY_MED_LIST_KEY = "medications-v1";
const FORCE_RELOAD_MARKER = "1";
const ENABLE_POPUP_REMINDERS = false;
const APP_BUILD = "20260709-201741";
const APP_RELEASE_LABEL = "PR22";
const CLOSE_ALL_SIGNAL_KEY = "med-helper-close-all-signal";
const CLOSE_ALL_CHANNEL = "med-helper-close-all";
const REFILL_THRESHOLDS = [7, 3, 1];
const DOSE_HISTORY_DAYS = 14;
const INTERACTION_RULES = [
  ["warfarin", "ibuprofen", "Possible bleeding risk when combined"],
  ["aspirin", "clopidogrel", "Blood thinner combination: verify with doctor"],
  ["lisinopril", "ibuprofen", "May reduce blood pressure medicine effect"]
];

const byId = (id) => document.getElementById(id);

const dom = {
  medForm: byId("medForm"),
  procedureForm: byId("procedureForm"),
  profileForm: byId("profileForm"),
  medList: byId("medList"),
  procedureList: byId("procedureList"),
  timeline: byId("timeline"),
  todaySummary: byId("todaySummary"),
  runningOutSummary: byId("runningOutSummary"),
  runningOutList: byId("runningOutList"),
  orderUserName: byId("orderUserName"),
  orderSummary: byId("orderSummary"),
  orderList: byId("orderList"),
  adherenceSummary: byId("adherenceSummary"),
  trendList: byId("trendList"),
  medTemplate: byId("medCardTemplate"),
  procedureTemplate: byId("procedureCardTemplate"),
  timelineTemplate: byId("timelineItemTemplate"),
  installButton: byId("installAppBtn"),
  highContrastBtn: byId("highContrastBtn"),
  safetyMessage: byId("safetyMessage"),
  procedureMessage: byId("procedureMessage"),
  closeAllBtn: byId("closeAllBtn"),
  emergencyBtn: byId("emergencyBtn"),
  emergencyDialog: byId("emergencyDialog"),
  medicalCardText: byId("medicalCardText"),
  emergencyCallLink: byId("emergencyCallLink"),
  closeEmergencyBtn: byId("closeEmergencyBtn"),
  alarmOverlay: byId("alarmOverlay"),
  alarmTitle: byId("alarmTitle"),
  alarmMessage: byId("alarmMessage"),
  alarmTakenBtn: byId("alarmTakenBtn"),
  alarmSkippedBtn: byId("alarmSkippedBtn"),
  alarmSnoozeBtn: byId("alarmSnoozeBtn"),
  alarmDismissBtn: byId("alarmDismissBtn"),
  alarmMuteTodayBtn: byId("alarmMuteTodayBtn"),
  shareCaregiverBtn: byId("shareCaregiverBtn"),
  notifyCaregiverBtn: byId("notifyCaregiverBtn"),
  requestRefillBtn: byId("requestRefillBtn"),
  callDoctorBtn: byId("callDoctorBtn"),
  exportCsvBtn: byId("exportCsvBtn"),
  exportProcedureCsvBtn: byId("exportProcedureCsvBtn"),
  exportMedListBtn: byId("exportMedListBtn"),
  exportAmPmBtn: byId("exportAmPmBtn"),
  printReportBtn: byId("printReportBtn"),
  markMorningTakenBtn: byId("markMorningTakenBtn"),
  markEveningTakenBtn: byId("markEveningTakenBtn"),
  catchUpBtn: byId("catchUpBtn"),
  startVoiceCmdBtn: byId("startVoiceCmdBtn"),
  exportBackupBtn: byId("exportBackupBtn"),
  importBackupInput: byId("importBackupInput"),
  addProfileBtn: byId("addProfileBtn"),
  switchProfileBtn: byId("switchProfileBtn"),
  buildInfo: byId("buildInfo"),
  medSubmitBtn: byId("medSubmitBtn"),
  medCancelEditBtn: byId("medCancelEditBtn"),
  procedureSubmitBtn: byId("procedureSubmitBtn"),
  procedureCancelEditBtn: byId("procedureCancelEditBtn")
};

if (dom.buildInfo) {
  dom.buildInfo.textContent = `Build: ${APP_BUILD} | ${APP_RELEASE_LABEL}`;
}

const stateApi = createStateApi({
  keys: {
    STORAGE_KEY,
    BACKUP_STORAGE_KEY,
    MEDS_BACKUP_KEY,
    RECOVERY_SNAPSHOT_KEY,
    LEGACY_MED_LIST_KEY
  },
  helpers: {
    makeId,
    defaultProfile,
    parseJSON,
    toDateKey,
    fixMedicationDosePlan
  }
});

const uiApi = createUiApi();
const formsApi = createFormsApi();
const rendererApi = createRendererApi();

let state = loadState();
// Immediately save to persist any migrations/fixes applied during load
saveState();
let deferredPrompt;
let activeAlarmDoseId = null;
let alarmIntervalId = null;
let lastAlarmSilenceUntil = null;
let muteAlarmsUntilKey = null;
let alarmCooldownUntil = 0;
let editingMedicationId = null;
let editingProcedureId = null;
let closeAllChannel = null;
let closeAllClickBound = false;

function attemptWindowClose() {
  // Browsers may only allow close for script-opened windows; this is best effort.
  try {
    window.open("", "_self");
  } catch {
    // Ignore and continue to close attempt.
  }
  window.close();
  if (!window.closed) {
    document.body.innerHTML = "<main style='padding:2rem;font-family:Georgia,serif'><h1>Window closed</h1><p>You can now close this tab.</p></main>";
  }
}

function requestCloseAllWindows() {
  const cards = Array.from(document.querySelectorAll("main section.card"));
  let closedCount = 0;

  cards.forEach((card) => {
    const toggle = card.querySelector(".card-toggle");
    if (!toggle) {
      return;
    }
    const isExpanded = toggle.getAttribute("aria-expanded") === "true";
    if (!isExpanded) {
      return;
    }
    card.classList.add("is-collapsed");
    toggle.setAttribute("aria-expanded", "false");
    closedCount += 1;
  });

  if (dom.safetyMessage) {
    dom.safetyMessage.textContent = closedCount > 0
      ? `Closed ${closedCount} open section${closedCount === 1 ? "" : "s"}.`
      : "All sections are already closed.";
  }
}

function bindCloseAllButton() {
  if (closeAllClickBound) {
    return;
  }
  closeAllClickBound = true;

  // Delegate so the handler still works if layout changes move/recreate the button.
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const closeBtn = target.closest("#closeAllBtn");
    if (!closeBtn) {
      return;
    }
    requestCloseAllWindows();
  });
}

function setupCloseAllListeners() {
  if (window.BroadcastChannel) {
    closeAllChannel = new BroadcastChannel(CLOSE_ALL_CHANNEL);
    closeAllChannel.onmessage = (event) => {
      if (event?.data?.type === "close-all") {
        attemptWindowClose();
      }
    };
  }

  window.addEventListener("storage", (event) => {
    if (event.key === CLOSE_ALL_SIGNAL_KEY && event.newValue) {
      attemptWindowClose();
    }
  });
}

function makeId() {
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultProfile() {
  return {
    id: makeId(),
    name: "Primary User",
    emergencyPhone: "",
    caregiverName: "",
    caregiverPhone: "",
    doctorPhone: "",
    pharmacyPhone: "",
    bloodGroup: "",
    conditions: "",
    allergies: "",
    voiceLang: "en-US"
  };
}

function parseJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildDefaultState() {
  return stateApi.buildDefaultState();
}

function normalizeState(parsed) {
  return stateApi.normalizeState(parsed);
}

function loadState() {
  return stateApi.loadState();
}

function saveState() {
  stateApi.saveState(state);
}

function getActiveProfile() {
  return stateApi.getActiveProfile(state);
}

function medsForActiveProfile() {
  return stateApi.medsForActiveProfile(state);
}

function proceduresForActiveProfile() {
  return stateApi.proceduresForActiveProfile(state);
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function parseDosePlan(raw) {
  return stateApi.parseDosePlan(raw);
}

function normalizeDosePlan(value) {
  return stateApi.normalizeDosePlan(value);
}

function hasDosePlan(med) {
  return Boolean(med && med.dosePlan && Object.keys(med.dosePlan).length > 0);
}

function getDoseQuantityForTime(med, time) {
  const fallback = Number(med?.pillsPerDose ?? 1);
  const planned = Number(med?.dosePlan?.[time]);
  if (Number.isFinite(planned) && planned > 0) {
    return planned;
  }
  if (Number.isFinite(planned) && planned === -1) {
    return -1;
  }
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 1;
}

function formatDosePlan(med) {
  if (med.frequency === "asRequired") {
    return `${Number(med.pillsPerDose || 1)} ${doseUnit(med)}`;
  }

  const times = Array.isArray(med.times) ? med.times : [];
  if (times.length === 0) {
    return `No schedule - ${Number(med.pillsPerDose || 1)} ${doseUnit(med)}`;
  }

  return times
    .map((time) => {
      const qty = getDoseQuantityForTime(med, time);
      const qtyText = qty === -1 ? "(not set)" : `${qty} ${doseUnit(med)}`;
      return `${time} ${qtyText}`;
    })
    .join(", ");
}

function serializeDosePlan(med) {
  if (!hasDosePlan(med)) {
    return "";
  }

  return Object.entries(med.dosePlan)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([time, quantity]) => `${time}=${quantity}`)
    .join(", ");
}

function fixMedicationDosePlan(med) {
  if (med.frequency === "asRequired") {
    med.dosePlan = {};
    med.times = [];
  } else if (Array.isArray(med.times) && med.times.length > 0) {
    const fallback = Number(med.pillsPerDose ?? 1);
    const newPlan = {};
    med.times.forEach((time) => {
      if (med.dosePlan?.[time]) {
        newPlan[time] = med.dosePlan[time];
      } else {
        newPlan[time] = fallback;
      }
    });
    med.dosePlan = newPlan;
    console.log(`Fixed ${med.name}: dosePlan now =`, med.dosePlan);
  }
  return med;
}

function includesDay(med, date) {
  const start = new Date(`${med.startDate}T00:00:00`);
  const target = new Date(`${toDateKey(date)}T00:00:00`);
  const dayDiff = Math.floor((target - start) / (1000 * 60 * 60 * 24));
  if (dayDiff < 0) {
    return false;
  }

  if (med.frequency === "asRequired") {
    return false;
  }

  if (med.frequency === "everyOtherDay") {
    return dayDiff % 2 === 0;
  }

  if (med.frequency === "weekly") {
    const weekly = med.weeklyDays || [];
    if (weekly.length === 0) {
      return target.getDay() === start.getDay();
    }
    return weekly.includes(target.getDay());
  }

  return true;
}

function pillsNeededPerDay(med) {
  if (med.frequency === "asRequired") {
    return 0;
  }
  const timesCount = Math.max(1, med.times.length);
  const fallbackDose = Number(med.pillsPerDose) || 1;
  const scheduledTotal = med.times.reduce((sum, time) => sum + getDoseQuantityForTime(med, time), 0);
  const base = med.frequency === "twiceDaily" && med.times.length < 2
    ? scheduledTotal + (Math.max(timesCount, 2) - med.times.length) * fallbackDose
    : (scheduledTotal || fallbackDose * timesCount);

  if (med.frequency === "everyOtherDay") {
    return base / 2;
  }
  if (med.frequency === "weekly") {
    const weeklyDays = med.weeklyDays?.length ? med.weeklyDays.length : 1;
    return (base * weeklyDays) / 7;
  }
  return base;
}

function daysLeft(med) {
  const needed = pillsNeededPerDay(med);
  if (needed <= 0) {
    return Infinity;
  }
  return Number(med.stock) / needed;
}

function doseId(medId, dateKey, time) {
  return `${medId}|${dateKey}|${time}`;
}

function createDueDosesForDate(date) {
  const key = toDateKey(date);
  const all = [];

  medsForActiveProfile().forEach((med) => {
    if (!includesDay(med, date)) {
      return;
    }

    med.times.forEach((time) => {
      const id = doseId(med.id, key, time);
      const existing = state.doses.find((dose) => dose.id === id);
      if (existing) {
        all.push(existing);
      } else {
        const created = {
          id,
          profileId: state.activeProfileId,
          medId: med.id,
          dateKey: key,
          time,
          status: "pending",
          snoozedUntil: null,
          timestamp: null
        };
        state.doses.push(created);
        all.push(created);
      }
    });
  });

  state.doses = state.doses.filter((entry) => entry.dateKey >= toDateKey(new Date(Date.now() - 1000 * 60 * 60 * 24 * DOSE_HISTORY_DAYS)));
  saveState();
  return all.sort((a, b) => a.time.localeCompare(b.time));
}

function findMed(medId) {
  return state.medications.find((med) => med.id === medId);
}

function lastTakenForMed(medId) {
  return state.doses
    .filter((dose) => dose.medId === medId && dose.status === "taken" && dose.timestamp)
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))[0];
}

function minHoursBetweenDoses(med) {
  const dailyNeed = pillsNeededPerDay(med);
  if (dailyNeed <= 0) {
    return 24;
  }
  return 24 / dailyNeed;
}

function markDose(dose, status, options = {}) {
  const med = findMed(dose.medId);
  const doseQuantity = med ? getDoseQuantityForTime(med, dose.time) : 1;
  if (!med) {
    dose.status = status;
    dose.timestamp = new Date().toISOString();
    dose.snoozedUntil = null;
    saveState();
    hideAlarm();
    renderAll();
    return;
  }

  if (status === "taken") {
    if (dose.status === "taken") {
      dom.safetyMessage.textContent = "This dose is already marked as taken.";
      return;
    }

    const previous = lastTakenForMed(med.id);
    if (previous?.timestamp && !options.add .force) {
      const minGapMs = minHoursBetweenDoses(med) * 60 * 60 * 1000;
      const gap = new Date() - new Date(previous.timestamp);
      if (gap < minGapMs) {
        dom.safetyMessage.textContent = "Warning: this dose may be too soon based on schedule. Marked as taken anyway.";
      }
    }
    med.stock = Math.max(0, Number(med.stock) - doseQuantity);
  }

  dose.status = status;
  dose.timestamp = new Date().toISOString();
  dose.snoozedUntil = null;
  saveState();
  hideAlarm();
  renderAll();
}

function snoozeDose(dose) {
  dose.status = "pending";
  dose.snoozedUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  saveState();
  hideAlarm();
  renderAll();
}

function untakeDose(dose) {
  const med = findMed(dose.medId);
  if (dose.status === "taken" && med) {
    med.stock = Number(med.stock) + getDoseQuantityForTime(med, dose.time);
  }

  dose.status = "pending";
  dose.timestamp = null;
  dose.snoozedUntil = null;
  saveState();
  hideAlarm();
  renderAll();
}

function logPrnDose(med) {
  const todayKey = toDateKey(new Date());
  const now = new Date();
  const time = now.toTimeString().slice(0, 5);
  const id = `${med.id}|${todayKey}|prn-${now.getTime()}`;
  const dose = {
    id,
    profileId: state.activeProfileId,
    medId: med.id,
    dateKey: todayKey,
    time,
    status: "taken",
    snoozedUntil: null,
    timestamp: now.toISOString()
  };
  state.doses.push(dose);
  med.stock = Math.max(0, Number(med.stock) - getDoseQuantityForTime(med, time));
  saveState();
  renderAll();
  dom.safetyMessage.textContent = `Logged ${med.name} at ${time}.`;
}

function overduePendingDoses() {
  const todayKey = toDateKey(new Date());
  return state.doses.filter((dose) => dose.profileId === state.activeProfileId && dose.status === "pending" && dose.dateKey < todayKey);
}

function backfillRecentDoseHistory(days = DOSE_HISTORY_DAYS) {
  for (let i = 1; i <= days; i += 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    createDueDosesForDate(date);
  }
}

function catchUpOverdueDoses() {
  backfillRecentDoseHistory();
  const overdue = overduePendingDoses();
  if (overdue.length === 0) {
    dom.safetyMessage.textContent = "No overdue pending doses to catch up.";
    return;
  }

  overdue.forEach((dose) => {
    const med = findMed(dose.medId);
    if (med) {
      med.stock = Math.max(0, Number(med.stock) - getDoseQuantityForTime(med, dose.time));
    }
    dose.status = "taken";
    dose.timestamp = new Date().toISOString();
    dose.snoozedUntil = null;
  });

  saveState();
  renderAll();
  dom.safetyMessage.textContent = `Caught up ${overdue.length} overdue dose(s).`;
}

function isMorningDose(dose) {
  const hour = Number(String(dose.time || "").split(":")[0]);
  if (!Number.isFinite(hour)) {
    return true;
  }
  return hour < 12;
}

function markAllByPeriodTaken(period) {
  const today = createDueDosesForDate(new Date());
  const target = today.filter((dose) => {
    if (dose.status === "taken") {
      return false;
    }
    return period === "morning" ? isMorningDose(dose) : !isMorningDose(dose);
  });

  if (target.length === 0) {
    dom.safetyMessage.textContent = `No ${period} doses to mark right now.`;
    return;
  }

  target.forEach((dose) => {
    const med = findMed(dose.medId);
    if (med) {
      med.stock = Math.max(0, Number(med.stock) - getDoseQuantityForTime(med, dose.time));
    }
    dose.status = "taken";
    dose.timestamp = new Date().toISOString();
    dose.snoozedUntil = null;
  });

  saveState();
  hideAlarm();
  renderAll();
  dom.safetyMessage.textContent = `Marked ${target.length} ${period} dose(s) as taken.`;
}

function friendlyFoodRule(rule) {
  if (rule === "before") {
    return "Before food";
  }
  if (rule === "after") {
    return "After food";
  }
  if (rule === "with") {
    return "With food";
  }
  return "No food rule";
}

function doseUnit(med) {
  switch (med.form) {
    case "cream": return "application(s)";
    case "drops": return "drop(s)";
    case "liquid": return "ml";
    case "patch": return "patch(es)";
    case "inhaler": return "puff(s)";
    case "injection": return "unit(s)";
    case "spray": return "spray(s)";
    case "wafer": return "wafer(s)";
    default: return "tablet(s)";
  }
}

function friendlyForm(form) {
  switch (form) {
    case "cream": return "Cream";
    case "drops": return "Drops";
    case "liquid": return "Liquid";
    case "patch": return "Patch";
    case "inhaler": return "Inhaler";
    case "injection": return "Injection";
    case "spray": return "Spray";
    case "wafer": return "Wafer";
    default: return "Tablet";
  }
}

function friendlyFrequency(freq) {
  if (freq === "twiceDaily") {
    return "Twice daily";
  }
  if (freq === "everyOtherDay") {
    return "Every other day";
  }
  if (freq === "weekly") {
    return "Weekly";
  }
  if (freq === "asRequired") {
    return "As required";
  }
  return "Daily";
}

function medDisplayLine(med) {
  if (med.frequency === "asRequired") {
    return `As required - ${med.pillsPerDose} ${doseUnit(med)}`;
  }
  return formatDosePlan(med);
}

function repeatsCount(med) {
  const value = Number(med.repeats ?? 0);
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function statusText(status) {
  if (status === "taken") {
    return "Taken";
  }
  if (status === "skipped") {
    return "Skipped";
  }
  return "Pending";
}

function refillFlag(med) {
  const d = daysLeft(med);
  if (!Number.isFinite(d)) {
    return "No schedule";
  }
  if (d <= 1) {
    return "Refill now";
  }
  if (d <= 3) {
    return "Refill in 1-3 days";
  }
  if (d <= 7) {
    return "Refill in less than a week";
  }
  return "Stock healthy";
}

function checkSafetyForNewMed(newMed, excludeMedId = null) {
  const existing = medsForActiveProfile();
  const duplicate = existing.find(
    (med) => med.id !== excludeMedId && med.name.toLowerCase() === newMed.name.toLowerCase() && med.strength.toLowerCase() === newMed.strength.toLowerCase()
  );
  if (duplicate) {
    return "Duplicate warning: same medicine and strength already added.";
  }

  const activeNames = existing.map((med) => med.name.toLowerCase());
  const candidate = newMed.name.toLowerCase();
  const pair = INTERACTION_RULES.find(
    ([a, b]) => (candidate.includes(a) && activeNames.some((item) => item.includes(b))) || (candidate.includes(b) && activeNames.some((item) => item.includes(a)))
  );
  if (pair) {
    return `Interaction alert: ${pair[2]}.`;
  }

  const allergies = getActiveProfile().allergies.toLowerCase();
  if (allergies && candidate && allergies.includes(candidate.split(" ")[0])) {
    return "Allergy alert: medication name appears in allergy list.";
  }

  return "";
}

function validateProcedureInput(procedure) {
  if (!stateApi.isValidPartialDate(procedure.date)) {
    return "Please enter a valid date as YYYY, YYYY-MM, or YYYY-MM-DD.";
  }
  if (!procedure.procedureName) {
    return "Please enter a procedure name.";
  }
  return "";
}

function resetProcedureEditMode() {
  editingProcedureId = null;
  if (dom.procedureSubmitBtn) {
    dom.procedureSubmitBtn.textContent = "Save Procedure";
  }
  if (dom.procedureCancelEditBtn) {
    dom.procedureCancelEditBtn.classList.add("hidden");
  }
}

function renderProcedures() {
  rendererApi.renderProcedures(proceduresForActiveProfile(), {
    dom,
    procedureSortKey: stateApi.procedureSortKey,
    setEditingProcedureId: (id) => {
      editingProcedureId = id;
    },
    state,
    saveState,
    renderAll
  });
}

function renderRunningOut(meds) {
  rendererApi.renderRunningOut(meds, {
    dom,
    daysLeft
  });
}

function renderOrderPriority(meds) {
  rendererApi.renderOrderPriority(meds, {
    dom,
    daysLeft,
    getActiveProfile,
    repeatsCount
  });
}

function renderMeds(meds) {
  rendererApi.renderMeds(meds, {
    dom,
    daysLeft,
    formatDosePlan,
    friendlyFoodRule,
    friendlyFrequency,
    repeatsCount,
    doseUnit,
    refillFlag,
    friendlyForm,
    setEditingMedicationId: (id) => {
      editingMedicationId = id;
    },
    serializeDosePlan,
    toDateKey,
    openMedicationFormCard,
    logPrnDose,
    state,
    saveState,
    renderAll
  });
}

function resetMedicationEditMode() {
  editingMedicationId = null;
  if (dom.medSubmitBtn) {
    dom.medSubmitBtn.textContent = "Save Medication";
  }
  if (dom.medCancelEditBtn) {
    dom.medCancelEditBtn.classList.add("hidden");
  }
  if (dom.medForm?.startDate) {
    dom.medForm.startDate.value = toDateKey(new Date());
  }
}

function renderTimeline(todayDoses, meds) {
  rendererApi.renderTimeline(todayDoses, meds, {
    dom,
    getDoseQuantityForTime,
    doseUnit,
    friendlyFoodRule,
    statusText,
    markDose,
    untakeDose,
    snoozeDose
  });
}

function renderAdherence(todayDoses) {
  rendererApi.renderAdherence(todayDoses, {
    dom,
    toDateKey,
    state,
    overduePendingDoses
  });
}

function maybeNotifyRefill(meds) {
  const messages = [];
  meds.forEach((med) => {
    const left = daysLeft(med);
    REFILL_THRESHOLDS.forEach((threshold) => {
      if (left <= threshold && left > threshold - 0.5) {
        messages.push(`${med.name}: about ${Math.max(0, left).toFixed(1)} day(s) left`);
      }
    });
  });
  if (messages.length) {
    dom.safetyMessage.textContent = `Refill alert: ${messages.join(" | ")}`;
  }
}

function showAlarm(dose, med) {
  if (!ENABLE_POPUP_REMINDERS) {
    return;
  }

  activeAlarmDoseId = dose.id;
  dom.alarmTitle.textContent = `Reminder: ${med.name}`;
  dom.alarmMessage.textContent = `${dose.time} - ${getDoseQuantityForTime(med, dose.time)} ${doseUnit(med)}. ${friendlyFoodRule(med.foodRule)}.`;
  dom.alarmOverlay.classList.remove("hidden");

  if (navigator.vibrate) {
    navigator.vibrate([500, 200, 500, 200, 700]);
  }

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Medication Reminder", { body: dom.alarmMessage.textContent });
  }

  speakReminder(med);
  startRepeatingAlarm();
}

function startRepeatingAlarm() {
  stopRepeatingAlarm();
  alarmIntervalId = window.setInterval(() => {
    playBeep();
    const profile = getActiveProfile();
    if (profile.caregiverPhone && activeAlarmDoseId) {
      const dose = state.doses.find((entry) => entry.id === activeAlarmDoseId);
      if (dose) {
        const due = new Date(`${dose.dateKey}T${dose.time}:00`);
        if (Date.now() - due.getTime() > 15 * 60 * 1000) {
          const marker = "No response yet. Consider calling caregiver.";
          if (!dom.alarmMessage.textContent.includes(marker)) {
            dom.alarmMessage.textContent = `${dom.alarmMessage.textContent} ${marker}`;
          }
        }
      }
    }
  }, 60000);
  playBeep();
}

function stopRepeatingAlarm() {
  if (alarmIntervalId) {
    clearInterval(alarmIntervalId);
    alarmIntervalId = null;
  }
}

function hideAlarm() {
  activeAlarmDoseId = null;
  dom.alarmOverlay.classList.add("hidden");
  stopRepeatingAlarm();
}

function silenceCurrentAlarm(minutes) {
  if (!activeAlarmDoseId) {
    return;
  }
  const dose = state.doses.find((entry) => entry.id === activeAlarmDoseId);
  if (dose) {
    dose.snoozedUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    saveState();
  }
  lastAlarmSilenceUntil = new Date(Date.now() + minutes * 60 * 1000);
  hideAlarm();
  renderAll();
}

function setAlarmCooldown(minutes) {
  alarmCooldownUntil = Date.now() + minutes * 60 * 1000;
}

function resolveActiveAlarm(action) {
  if (!activeAlarmDoseId) {
    hideAlarm();
    return;
  }

  const dose = state.doses.find((entry) => entry.id === activeAlarmDoseId);
  if (!dose) {
    hideAlarm();
    setAlarmCooldown(10);
    dom.safetyMessage.textContent = "Reminder cleared. Please refresh timeline.";
    return;
  }

  if (action === "taken") {
    markDose(dose, "taken", { force: true });
    setAlarmCooldown(1);
    return;
  }

  if (action === "skipped") {
    dose.status = "skipped";
    dose.timestamp = new Date().toISOString();
    dose.snoozedUntil = null;
    saveState();
    hideAlarm();
    setAlarmCooldown(1);
    renderAll();
    return;
  }

  if (action === "snooze") {
    snoozeDose(dose);
    setAlarmCooldown(10);
    return;
  }
}

function playBeep() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }
  const ctx = new AudioContextClass();
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.frequency.value = 880;
  oscillator.type = "square";
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  gainNode.gain.value = 0.2;
  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.35);
}

function speakReminder(med) {
  if (!window.speechSynthesis) {
    return;
  }
  const profile = getActiveProfile();
  const nextDose = (Array.isArray(med.times) && med.times[0]) || "08:00";
  const quantity = getDoseQuantityForTime(med, nextDose);
  const utterance = new SpeechSynthesisUtterance(`Time for ${med.name}. Please take ${quantity} ${doseUnit(med)}.`);
  utterance.lang = profile.voiceLang || "en-US";
  utterance.rate = 0.95;
  speechSynthesis.speak(utterance);
}

function checkDueAlarms() {
  if (!ENABLE_POPUP_REMINDERS) {
    hideAlarm();
    return;
  }

  const activeMeds = medsForActiveProfile();
  if (activeMeds.length === 0) {
    hideAlarm();
    return;
  }

  const now = new Date();
  if (Date.now() < alarmCooldownUntil) {
    return;
  }
  const todayKey = toDateKey(now);
  if (muteAlarmsUntilKey === todayKey) {
    return;
  }
  if (lastAlarmSilenceUntil && now < lastAlarmSilenceUntil) {
    return;
  }
  const today = createDueDosesForDate(now);
  if (activeAlarmDoseId) {
    return;
  }

  const pending = today.find((dose) => {
    if (dose.status !== "pending") {
      return false;
    }
    if (dose.snoozedUntil && new Date(dose.snoozedUntil) > now) {
      return false;
    }
    const due = new Date(`${dose.dateKey}T${dose.time}:00`);
    return now >= due;
  });

  if (pending) {
    const med = findMed(pending.medId);
    if (med) {
      showAlarm(pending, med);
    }
  }
}

function syncProfileForm() {
  const profile = getActiveProfile();
  const form = dom.profileForm;
  form.profileName.value = profile.name || "";
  form.emergencyPhone.value = profile.emergencyPhone || "";
  form.caregiverName.value = profile.caregiverName || "";
  form.caregiverPhone.value = profile.caregiverPhone || "";
  form.doctorPhone.value = profile.doctorPhone || "";
  form.pharmacyPhone.value = profile.pharmacyPhone || "";
  form.bloodGroup.value = profile.bloodGroup || "";
  form.conditions.value = profile.conditions || "";
  form.allergies.value = profile.allergies || "";
  form.voiceLang.value = profile.voiceLang || "en-US";

  const hasTwoProfiles = state.profiles.length >= 2;
  dom.addProfileBtn.disabled = hasTwoProfiles;
  dom.addProfileBtn.textContent = hasTwoProfiles ? "Second User Added" : "Add Second User";
  dom.addProfileBtn.title = hasTwoProfiles ? "Two-user limit reached" : "Add second user";
  dom.switchProfileBtn.disabled = false;
  dom.switchProfileBtn.title = hasTwoProfiles ? "Switch between users" : "Add second user first";
}

function emergencyDoseAbbrev(med) {
  if (med.frequency === "asRequired") {
    return "";
  }

  const dailyDose = pillsNeededPerDay(med);
  if (!Number.isFinite(dailyDose) || dailyDose <= 0) {
    return "";
  }

  const formatted = Number.isInteger(dailyDose) ? String(dailyDose) : String(Number(dailyDose.toFixed(2)));
  return ` (${formatted})`;
}

function updateMedicalCard() {
  const profile = getActiveProfile();
  const meds = medsForActiveProfile()
    .map((med) => `${med.frequency === "asRequired" ? "*" : ""}${med.name} ${med.strength}${emergencyDoseAbbrev(med)}`)
    .join(", ");
  const medsLabel = meds || "None";
  dom.medicalCardText.textContent = `${profile.name} | Blood: ${profile.bloodGroup || "Unknown"} | Conditions: ${profile.conditions || "None"} | Allergies: ${profile.allergies || "None"} | Current meds: ${medsLabel}`;
  dom.emergencyCallLink.href = profile.emergencyPhone ? `tel:${profile.emergencyPhone}` : "#";
}

function recoverProfileMedicationVisibility() {
  stateApi.recoverProfileMedicationVisibility(state, {
    getActiveProfile,
    saveState
  });
}

function renderAll() {
  rendererApi.renderAll({
    recoverProfileMedicationVisibility,
    state,
    enablePopupReminders: ENABLE_POPUP_REMINDERS,
    hideAlarm,
    medsForActiveProfile,
    createDueDosesForDate,
    renderRunningOut,
    renderOrderPriority,
    renderMeds,
    renderProcedures,
    renderTimeline,
    renderAdherence,
    maybeNotifyRefill,
    syncProfileForm,
    updateMedicalCard
  });
}

async function fileToDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

function downloadTextFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function caregiverStatusMessage() {
  const profile = getActiveProfile();
  const today = createDueDosesForDate(new Date());
  const taken = today.filter((dose) => dose.status === "taken").length;
  return `${profile.name}: ${taken}/${today.length} doses taken today.`;
}

function notifyCaregiverByLink() {
  const profile = getActiveProfile();
  if (!profile.caregiverPhone) {
    dom.safetyMessage.textContent = "Add caregiver phone first.";
    return;
  }
  const msg = encodeURIComponent(`Medication alert: ${caregiverStatusMessage()}`);
  window.location.href = `sms:${profile.caregiverPhone}?body=${msg}`;
}

function exportCsv() {
  const rows = ["date,time,medication,status,timestamp"];
  const visibleMeds = medsForActiveProfile();
  const visibleMedIds = new Set(visibleMeds.map((med) => med.id));

  let dosesForExport = state.doses.filter((dose) => visibleMedIds.has(dose.medId));
  if (dosesForExport.length === 0) {
    dosesForExport = createDueDosesForDate(new Date()).filter((dose) => visibleMedIds.has(dose.medId));
  }

  if (dosesForExport.length === 0 && visibleMeds.length > 0) {
    // Fallback rows so CSV is useful even before first dose action.
    visibleMeds.forEach((med) => {
      rows.push(`${toDateKey(new Date())},${(med.times && med.times[0]) || ""},${med.name},planned,`);
    });
  } else {
    dosesForExport.forEach((dose) => {
      const med = findMed(dose.medId);
      rows.push(`${dose.dateKey},${dose.time},${med ? med.name : "Unknown"},${dose.status},${dose.timestamp || ""}`);
    });
  }

  downloadTextFile("medication-history.csv", rows.join("\n"), "text/csv");
  dom.safetyMessage.textContent = `Exported ${Math.max(0, rows.length - 1)} row(s) to CSV.`;
}

function exportProceduresCsv() {
  const rows = ["date,procedure_name,doctor_name,notes"];
  const procedures = proceduresForActiveProfile()
    .slice()
    .sort((a, b) => stateApi.procedureSortKey(b.date || "").localeCompare(stateApi.procedureSortKey(a.date || "")));

  procedures.forEach((procedure) => {
    const safeDate = JSON.stringify(String(procedure.date || ""));
    const safeName = JSON.stringify(String(procedure.procedureName || ""));
    const safeDoctor = JSON.stringify(String(procedure.doctorName || ""));
    const safeNotes = JSON.stringify(String(procedure.notes || ""));
    rows.push(`${safeDate},${safeName},${safeDoctor},${safeNotes}`);
  });

  downloadTextFile("procedure-history.csv", rows.join("\n"), "text/csv");
  dom.procedureMessage.textContent = `Exported ${procedures.length} procedure row(s) to CSV.`;
}

function exportMedList() {
  const profile = getActiveProfile();
  const meds = medsForActiveProfile()
    .map((med) => ({ med, left: daysLeft(med) }))
    .sort((a, b) => {
      if (!Number.isFinite(a.left) && !Number.isFinite(b.left)) {
        return a.med.name.localeCompare(b.med.name);
      }
      if (!Number.isFinite(a.left)) {
        return 1;
      }
      if (!Number.isFinite(b.left)) {
        return -1;
      }
      if (a.left !== b.left) {
        return a.left - b.left;
      }
      return a.med.name.localeCompare(b.med.name);
    })
    .map((item) => item.med);
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const FOOD_LABELS = { none: "No special requirement", before: "Take before food", with: "Take with food", after: "Take after food" };
  const FREQ_LABELS = { daily: "Every day", alternate: "Every other day", weekly: "Selected days only" };

  const lines = [];
  lines.push("MEDICATION LIST");
  lines.push("==".repeat(30));
  lines.push(`Name       : ${profile.name || "Not set"}`);
  lines.push(`Date       : ${date}`);
  if (profile.bloodGroup)   lines.push(`Blood group: ${profile.bloodGroup}`);
  if (profile.conditions)   lines.push(`Conditions : ${profile.conditions}`);
  if (profile.allergies)    lines.push(`Allergies  : ${profile.allergies}`);
  if (profile.doctorPhone)  lines.push(`Doctor     : ${profile.doctorPhone}`);
  if (profile.pharmacyPhone) lines.push(`Pharmacy   : ${profile.pharmacyPhone}`);
  lines.push("");
  lines.push(`MEDICATIONS (${meds.length})`);
  lines.push("--".repeat(30));

  if (meds.length === 0) {
    lines.push("No medications recorded.");
  } else {
    meds.forEach((med, i) => {
      lines.push("");
      lines.push(`${i + 1}. ${med.name}${med.strength ? "  " + med.strength : ""}`);
      if (med.purpose) lines.push(`   Purpose  : ${med.purpose}`);
      const times = Array.isArray(med.times) && med.times.length > 0 ? med.times.join(", ") : "Not set";
      lines.push(`   Schedule : ${FREQ_LABELS[med.frequency] || med.frequency || "Daily"}  —  ${times}`);
      lines.push(`   Dose plan: ${formatDosePlan(med)}`);
      lines.push(`   Repeats  : ${repeatsCount(med)}`);
      lines.push(`   Food     : ${FOOD_LABELS[med.foodRule] || med.foodRule || "No special requirement"}`);
      if (med.notes) lines.push(`   Notes    : ${med.notes}`);
    });
  }

  const procedures = proceduresForActiveProfile()
    .slice()
    .sort((a, b) => stateApi.procedureSortKey(b.date || "").localeCompare(stateApi.procedureSortKey(a.date || "")));
  lines.push("");
  lines.push(`PROCEDURES (${procedures.length})`);
  lines.push("--".repeat(30));
  if (procedures.length === 0) {
    lines.push("No procedures recorded.");
  } else {
    procedures.forEach((procedure, i) => {
      lines.push("");
      lines.push(`${i + 1}. ${procedure.date}  ${procedure.procedureName}`);
      lines.push(`   Doctor   : ${procedure.doctorName}`);
      if (procedure.notes) {
        lines.push(`   Notes    : ${procedure.notes}`);
      }
    });
  }

  lines.push("");
  lines.push("==".repeat(30));
  lines.push("Generated by Medication Helper app.");

  const safeName = profile.name ? profile.name.replace(/\s+/g, "-").toLowerCase() + "-" : "";
  const filename = `medication-list-${safeName}${toDateKey(new Date())}.txt`;
  downloadTextFile(filename, lines.join("\n"), "text/plain");
  dom.safetyMessage.textContent = `Medication list exported as ${filename}.`;
}

function exportAmPmList() {
  const profile = getActiveProfile();
  const meds = medsForActiveProfile()
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const timeGroups = new Map();
  const unsetRows = [];

  const toMinutes = (time) => {
    const match = String(time || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
      return Number.POSITIVE_INFINITY;
    }
    return Number(match[1]) * 60 + Number(match[2]);
  };

  meds.forEach((med) => {
    const times = Array.isArray(med.times) ? med.times : [];
    if (times.length === 0) {
      unsetRows.push(`- ${med.name}${med.strength ? ` (${med.strength})` : ""} - time not set`);
      return;
    }

    times.forEach((time) => {
      const minutes = toMinutes(time);
      const doseLine = `- ${med.name}${med.strength ? ` (${med.strength})` : ""} - ${getDoseQuantityForTime(med, time)} ${doseUnit(med)}`;

      if (!timeGroups.has(time)) {
        timeGroups.set(time, { minutes, rows: [] });
      }

      timeGroups.get(time).rows.push({ medName: med.name, line: doseLine });
    });
  });

  const lines = [];
  lines.push("Medication Summary (AM/PM)");
  lines.push(`Profile: ${profile.name || "Current user"}`);
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push("");

  const sortedTimes = Array.from(timeGroups.entries())
    .sort((a, b) => a[1].minutes - b[1].minutes || a[0].localeCompare(b[0]));

  if (sortedTimes.length === 0 && unsetRows.length === 0) {
    lines.push("- None");
  } else {
    sortedTimes.forEach(([time, group]) => {
      lines.push(time);
      group.rows
        .sort((a, b) => a.medName.localeCompare(b.medName))
        .forEach((row) => lines.push(row.line));
      lines.push("");
    });

    if (unsetRows.length > 0) {
      lines.push("Time not set");
      unsetRows
        .slice()
        .sort((a, b) => a.localeCompare(b))
        .forEach((row) => lines.push(row));
    } else if (lines[lines.length - 1] === "") {
      lines.pop();
    }
  }

  const safeName = profile.name ? profile.name.replace(/\s+/g, "-").toLowerCase() + "-" : "";
  const filename = `medication-summary-am-pm-${safeName}${toDateKey(new Date())}.txt`;
  downloadTextFile(filename, lines.join("\n"), "text/plain");
  dom.safetyMessage.textContent = `AM/PM medication summary exported as ${filename}.`;
}

function exportBackup() {
  downloadTextFile("medication-backup.json", JSON.stringify(state, null, 2), "application/json");
}

function normalizeImportedBackup(parsed) {
  if (!parsed) {
    return null;
  }

  if (Array.isArray(parsed)) {
    const fallback = buildDefaultState();
    fallback.medications = parsed.map((item) => ({
      id: item.id || makeId(),
      profileId: fallback.activeProfileId,
      name: item.name || "Medication",
      strength: item.strength || item.dose || "",
      purpose: item.purpose || item.notes || "Imported from backup",
      stock: Number(item.stock ?? 0),
      pillsPerDose: Number(item.pillsPerDose ?? 1),
      form: item.form || "tablet",
      repeats: Number(item.repeats ?? 0),
      times: Array.isArray(item.times) && item.times.length > 0 ? item.times : ["08:00"],
      dosePlan: normalizeDosePlan(item.dosePlan),
      foodRule: item.foodRule || "none",
      frequency: item.frequency || "daily",
      weeklyDays: Array.isArray(item.weeklyDays) ? item.weeklyDays : [],
      barcode: item.barcode || "",
      notes: item.notes || "",
      startDate: item.startDate || toDateKey(new Date()),
      photoDataUrl: item.photoDataUrl || ""
    }));
    return fallback;
  }

  if (parsed.state && typeof parsed.state === "object") {
    return normalizeState(parsed.state);
  }

  if (Array.isArray(parsed.profiles) && parsed.profiles.length > 0) {
    const normalized = normalizeState({
      profiles: parsed.profiles,
      activeProfileId: parsed.activeProfileId,
      medications: Array.isArray(parsed.medications) ? parsed.medications : [],
      procedures: Array.isArray(parsed.procedures) ? parsed.procedures : [],
      doses: Array.isArray(parsed.doses) ? parsed.doses : [],
      settings: parsed.settings || { highContrast: false }
    });
    if (normalized) {
      return normalized;
    }
  }

  if (Array.isArray(parsed.medications)) {
    const fallback = buildDefaultState();
    fallback.medications = parsed.medications.map((item) => ({
      id: item.id || makeId(),
      profileId: fallback.activeProfileId,
      name: item.name || "Medication",
      strength: item.strength || item.dose || "",
      purpose: item.purpose || item.notes || "Imported from backup",
      stock: Number(item.stock ?? 0),
      pillsPerDose: Number(item.pillsPerDose ?? 1),
      form: item.form || "tablet",
      repeats: Number(item.repeats ?? 0),
      times: Array.isArray(item.times) && item.times.length > 0 ? item.times : ["08:00"],
      dosePlan: normalizeDosePlan(item.dosePlan),
      foodRule: item.foodRule || "none",
      frequency: item.frequency || "daily",
      weeklyDays: Array.isArray(item.weeklyDays) ? item.weeklyDays : [],
      barcode: item.barcode || "",
      notes: item.notes || "",
      startDate: item.startDate || toDateKey(new Date()),
      photoDataUrl: item.photoDataUrl || ""
    }));
    return fallback;
  }

  return null;
}

async function importBackup(file) {
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const normalized = normalizeImportedBackup(parsed);
    if (!normalized) {
      throw new Error("Invalid backup file");
    }
    state = normalized;
    saveState();
    renderAll();
    dom.safetyMessage.textContent = "Backup restored.";
  } catch {
    dom.safetyMessage.textContent = "Backup restore failed. Use a valid JSON export.";
  } finally {
    if (dom.importBackupInput) {
      dom.importBackupInput.value = "";
    }
  }
}

function switchUser() {
  if (state.profiles.length < 2) {
    dom.safetyMessage.textContent = "Only one user exists. Use Add Second User first.";
    return;
  }
  const currentIndex = state.profiles.findIndex((profile) => profile.id === state.activeProfileId);
  const nextIndex = (currentIndex + 1) % state.profiles.length;
  state.activeProfileId = state.profiles[nextIndex].id;
  saveState();
  renderAll();
  dom.safetyMessage.textContent = `Switched to ${getActiveProfile().name}.`;
}

function setupCollapsibleCards() {
  uiApi.setupCollapsibleCards();
}

function openMedicationFormCard() {
  const target = document.getElementById("medFormTarget");
  const card = target?.nextElementSibling?.classList?.contains("card") ? target.nextElementSibling : dom.medForm?.closest("section.card");
  const toggleBtn = card?.querySelector(".card-toggle");

  if (card && card.classList.contains("is-collapsed") && toggleBtn) {
    toggleBtn.click();
  }

  return target || card || dom.medForm;
}

function bindEvents() {
  dom.profileForm.addEventListener("submit", (event) => {
    formsApi.handleProfileSubmit(event, {
      dom,
      getActiveProfile,
      saveState,
      renderAll
    });
  });

  dom.addProfileBtn.addEventListener("click", () => {
    if (state.profiles.length >= 2) {
      dom.safetyMessage.textContent = "Multi-user mode supports up to two users in this version.";
      return;
    }
    const second = defaultProfile();
    second.name = "Second User";
    state.profiles.push(second);
    state.activeProfileId = second.id;
    saveState();
    renderAll();
  });

  dom.switchProfileBtn.addEventListener("click", switchUser);

  dom.medForm.addEventListener("submit", async (event) => {
    await formsApi.handleMedicationSubmit(event, {
      dom,
      state,
      editingMedicationId,
      fileToDataUrl,
      toDateKey,
      isValidDateKey: stateApi.isValidDateKey,
      parseDosePlan,
      parseTimes: stateApi.parseTimes,
      parseWeeklyDays: stateApi.parseWeeklyDays,
      makeId,
      checkSafetyForNewMed,
      saveState,
      resetMedicationEditMode,
      renderAll
    });
  });

  dom.medCancelEditBtn?.addEventListener("click", () => {
    dom.medForm.reset();
    resetMedicationEditMode();
    dom.safetyMessage.textContent = "Edit cancelled.";
  });

  dom.procedureForm.addEventListener("submit", (event) => {
    formsApi.handleProcedureSubmit(event, {
      dom,
      state,
      editingProcedureId,
      makeId,
      validateProcedureInput,
      saveState,
      resetProcedureEditMode,
      renderAll
    });
  });

  dom.procedureCancelEditBtn?.addEventListener("click", () => {
    dom.procedureForm.reset();
    resetProcedureEditMode();
    dom.procedureMessage.textContent = "Edit cancelled.";
  });

  dom.alarmTakenBtn.addEventListener("click", () => {
    resolveActiveAlarm("taken");
  });

  dom.alarmSkippedBtn.addEventListener("click", () => {
    resolveActiveAlarm("skipped");
  });

  dom.alarmSnoozeBtn.addEventListener("click", () => {
    resolveActiveAlarm("snooze");
  });

  dom.alarmDismissBtn.addEventListener("click", () => silenceCurrentAlarm(10));
  dom.alarmMuteTodayBtn.addEventListener("click", () => {
    muteAlarmsUntilKey = toDateKey(new Date());
    hideAlarm();
    dom.safetyMessage.textContent = "Reminders muted for today.";
  });

  // Backdrop click behaves like quick silence so users never feel trapped.
  dom.alarmOverlay.addEventListener("click", (event) => {
    if (event.target === dom.alarmOverlay) {
      silenceCurrentAlarm(10);
    }
  });

  // Keyboard escape acts as a 10-minute silence.
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dom.alarmOverlay.classList.contains("hidden")) {
      silenceCurrentAlarm(10);
    }
  });

  dom.highContrastBtn.addEventListener("click", () => {
    state.settings.highContrast = !state.settings.highContrast;
    saveState();
    renderAll();
  });

  dom.closeAllBtn?.addEventListener("click", requestCloseAllWindows);
  dom.emergencyBtn.addEventListener("click", () => dom.emergencyDialog.showModal());
  dom.closeEmergencyBtn.addEventListener("click", () => dom.emergencyDialog.close());

  dom.shareCaregiverBtn.addEventListener("click", async () => {
    const message = caregiverStatusMessage();
    if (navigator.share) {
      try {
        await navigator.share({ title: "Medication Adherence", text: message });
      } catch {
        dom.safetyMessage.textContent = "Share cancelled.";
      }
    } else {
      await navigator.clipboard?.writeText(message);
      dom.safetyMessage.textContent = "Status copied for caregiver.";
    }
  });

  dom.notifyCaregiverBtn.addEventListener("click", notifyCaregiverByLink);

  dom.requestRefillBtn.addEventListener("click", () => {
    const profile = getActiveProfile();
    if (!profile.pharmacyPhone) {
      dom.safetyMessage.textContent = "Add pharmacy phone in profile.";
      return;
    }
    const text = encodeURIComponent(`Hello, please prepare refill for ${profile.name}.`);
    window.location.href = `sms:${profile.pharmacyPhone}?body=${text}`;
  });

  dom.callDoctorBtn.addEventListener("click", () => {
    const profile = getActiveProfile();
    if (!profile.doctorPhone) {
      dom.safetyMessage.textContent = "Add doctor phone in profile.";
      return;
    }
    window.location.href = `tel:${profile.doctorPhone}`;
  });

  dom.exportCsvBtn.addEventListener("click", exportCsv);
  dom.exportProcedureCsvBtn.addEventListener("click", exportProceduresCsv);
  dom.exportMedListBtn.addEventListener("click", exportMedList);
  dom.exportAmPmBtn.addEventListener("click", exportAmPmList);
  dom.printReportBtn.addEventListener("click", () => window.print());
  dom.markMorningTakenBtn.addEventListener("click", () => markAllByPeriodTaken("morning"));
  dom.markEveningTakenBtn.addEventListener("click", () => markAllByPeriodTaken("evening"));
  dom.catchUpBtn.addEventListener("click", catchUpOverdueDoses);
  dom.exportBackupBtn.addEventListener("click", exportBackup);
  dom.importBackupInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const confirmed = window.confirm(
      "Restore backup?\n\nThis will replace all current data including medications, doses, and profiles. This cannot be undone.\n\nAre you sure you want to continue?"
    );
    if (!confirmed) {
      dom.importBackupInput.value = "";
      return;
    }
    importBackup(file);
  });

  dom.startVoiceCmdBtn.addEventListener("click", () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      dom.safetyMessage.textContent = "Voice commands are not supported on this device.";
      return;
    }

    const recognizer = new Recognition();
    recognizer.lang = getActiveProfile().voiceLang || "en-US";
    recognizer.onresult = (event) => {
      const text = String(event.results?.[0]?.[0]?.transcript || "").toLowerCase();
      const today = createDueDosesForDate(new Date());
      if (text.includes("mark") && text.includes("taken")) {
        const targetDose = today.find((dose) => dose.status === "pending");
        if (targetDose) {
          markDose(targetDose, "taken");
          dom.safetyMessage.textContent = "Voice command done: next pending dose marked taken.";
        }
      }
    };
    recognizer.start();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    dom.installButton.classList.remove("hidden");
  });

  dom.installButton.addEventListener("click", async () => {
    if (!deferredPrompt) {
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    dom.installButton.classList.add("hidden");
  });
}

function forceParamState() {
  const params = new URLSearchParams(window.location.search);
  return {
    token: params.get("force"),
    reloaded: params.get("reloaded") === FORCE_RELOAD_MARKER,
    params
  };
}

async function clearOfflineCaches() {
  if (!("caches" in window)) {
    return;
  }
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

async function unregisterServiceWorkers() {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

async function applyForceRefreshFlow() {
  const forceState = forceParamState();
  if (!forceState.token) {
    return false;
  }

  try {
    await Promise.all([clearOfflineCaches(), unregisterServiceWorkers()]);
    if (dom.safetyMessage) {
      dom.safetyMessage.textContent = `Force refresh ${forceState.token} applied.`;
    }
  } catch {
    // If cleanup fails, continue with a normal load path.
  }

  if (!forceState.reloaded) {
    forceState.params.set("reloaded", FORCE_RELOAD_MARKER);
    const query = forceState.params.toString();
    window.location.replace(`${window.location.pathname}?${query}`);
    return true;
  }

  return false;
}

function shouldRegisterServiceWorker() {
  const forceState = forceParamState();
  if (!forceState.token) {
    return true;
  }
  return forceState.reloaded;
}

if ("serviceWorker" in navigator) {
  let refreshTriggered = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshTriggered) {
      return;
    }
    refreshTriggered = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    if (!shouldRegisterServiceWorker()) {
      return;
    }
    navigator.serviceWorker.register(`sw.js?v=${APP_BUILD}`).then((registration) => {
      registration.update();
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) {
          return;
        }
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            worker.postMessage({ type: "SKIP_WAITING" });
            dom.safetyMessage.textContent = "Updating app to latest version...";
          }
        });
      });
    }).catch(() => {
      // If registration fails, the app still works as a normal website.
    });
  });
}

if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission();
}

applyForceRefreshFlow().then((reloading) => {
  if (reloading) {
    return;
  }
  setupCloseAllListeners();
  bindCloseAllButton();
  setupCollapsibleCards();
  bindEvents();
  resetProcedureEditMode();
  renderAll();
  if (ENABLE_POPUP_REMINDERS) {
    window.setInterval(checkDueAlarms, 30000);
  }
});
