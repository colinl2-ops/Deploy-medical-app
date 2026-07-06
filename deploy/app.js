const STORAGE_KEY = "med-helper-v3";
const BACKUP_STORAGE_KEY = "med-helper-v3-backup";
const MEDS_BACKUP_KEY = "med-helper-meds-v1";
const RECOVERY_SNAPSHOT_KEY = "med-helper-recovery-v1";
const LEGACY_MED_LIST_KEY = "medications-v1";
const FORCE_RELOAD_MARKER = "1";
const ENABLE_POPUP_REMINDERS = false;
const APP_BUILD = "20260707-095506";
const APP_RELEASE_LABEL = "move3";
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
  const first = defaultProfile();
  return {
    profiles: [first],
    activeProfileId: first.id,
    medications: [],
    procedures: [],
    doses: [],
    settings: { highContrast: false }
  };
}

function normalizeState(parsed) {
  if (!parsed || !Array.isArray(parsed.profiles) || parsed.profiles.length === 0) {
    return null;
  }

  const profiles = parsed.profiles;
  const resolvedActiveProfileId = profiles.some((profile) => profile.id === parsed.activeProfileId)
    ? parsed.activeProfileId
    : profiles[0].id;

  const migratedMeds = (parsed.medications || []).map((med) => ({
    ...med,
    profileId: med.profileId || resolvedActiveProfileId
  }));

  const migratedDoses = (parsed.doses || []).map((dose) => ({
    ...dose,
    profileId: dose.profileId || resolvedActiveProfileId
  }));

  const migratedProcedures = (parsed.procedures || []).map((procedure) => ({
    ...procedure,
    profileId: procedure.profileId || resolvedActiveProfileId
  }));

  return {
    profiles,
    activeProfileId: resolvedActiveProfileId,
    medications: migratedMeds,
    procedures: migratedProcedures,
    doses: migratedDoses,
    settings: parsed.settings || { highContrast: false }
  };
}

function recoverLegacyMedications(activeProfileId) {
  const legacy = parseJSON(localStorage.getItem(LEGACY_MED_LIST_KEY) || "null");
  if (!Array.isArray(legacy) || legacy.length === 0) {
    return [];
  }

  return legacy.map((item) => ({
    id: item.id || makeId(),
    profileId: activeProfileId,
    name: item.name || "Medication",
    strength: item.dose || "",
    purpose: "Imported from older app",
    stock: 0,
    pillsPerDose: 1,
    form: "tablet",
    repeats: 0,
    times: ["08:00"],
    foodRule: "none",
    frequency: "daily",
    weeklyDays: [],
    barcode: "",
    notes: item.notes || "",
    startDate: toDateKey(new Date()),
    photoDataUrl: ""
  }));
}

function recoverMedsBackup(activeProfileId) {
  const backup = parseJSON(localStorage.getItem(MEDS_BACKUP_KEY) || "null");
  if (!Array.isArray(backup) || backup.length === 0) {
    return [];
  }

  return backup
    .filter((item) => item && typeof item === "object" && item.name)
    .map((item) => ({
      id: item.id || makeId(),
      profileId: item.profileId || activeProfileId,
      name: item.name || "Medication",
      strength: item.strength || item.dose || "",
      purpose: item.purpose || "Imported from backup",
      stock: Number(item.stock ?? 0),
      pillsPerDose: Number(item.pillsPerDose ?? 1),
      form: item.form || "tablet",
      repeats: Number(item.repeats ?? 0),
      times: Array.isArray(item.times) && item.times.length > 0 ? item.times : ["08:00"],
      foodRule: item.foodRule || "none",
      frequency: item.frequency || "daily",
      weeklyDays: Array.isArray(item.weeklyDays) ? item.weeklyDays : [],
      barcode: item.barcode || "",
      notes: item.notes || "",
      startDate: item.startDate || toDateKey(new Date()),
      photoDataUrl: item.photoDataUrl || ""
    }));
}

function recoverMedsFromStateSnapshot(rawState, activeProfileId) {
  const normalized = normalizeState(rawState);
  if (!normalized || !Array.isArray(normalized.medications) || normalized.medications.length === 0) {
    return [];
  }

  return normalized.medications.map((item) => ({
    ...item,
    profileId: item.profileId || activeProfileId
  }));
}

function loadState() {
  const primary = normalizeState(parseJSON(localStorage.getItem(STORAGE_KEY) || "null"));
  if (primary) {
    if (primary.medications.length === 0) {
      const medsBackup = recoverMedsBackup(primary.activeProfileId);
      if (medsBackup.length > 0) {
        primary.medications = medsBackup;
      } else {
        const recovered = recoverLegacyMedications(primary.activeProfileId);
        if (recovered.length > 0) {
          primary.medications = recovered;
        } else {
          const snapshotMeds = recoverMedsFromStateSnapshot(
            parseJSON(localStorage.getItem(RECOVERY_SNAPSHOT_KEY) || "null"),
            primary.activeProfileId
          );
          if (snapshotMeds.length > 0) {
            primary.medications = snapshotMeds;
          }
        }
      }
    }
    primary.medications = primary.medications.map((med) => fixMedicationDosePlan(med));
    return primary;
  }

  const backup = normalizeState(parseJSON(localStorage.getItem(BACKUP_STORAGE_KEY) || "null"));
  if (backup) {
    if (backup.medications.length === 0) {
      const snapshotMeds = recoverMedsFromStateSnapshot(
        parseJSON(localStorage.getItem(RECOVERY_SNAPSHOT_KEY) || "null"),
        backup.activeProfileId
      );
      if (snapshotMeds.length > 0) {
        backup.medications = snapshotMeds;
      }
    }
    backup.medications = backup.medications.map((med) => fixMedicationDosePlan(med));
    return backup;
  }

  const fallback = buildDefaultState();
  const medsBackup = recoverMedsBackup(fallback.activeProfileId);
  if (medsBackup.length > 0) {
    fallback.medications = medsBackup;
    fallback.medications = fallback.medications.map((med) => fixMedicationDosePlan(med));
    return fallback;
  }

  const snapshotMeds = recoverMedsFromStateSnapshot(
    parseJSON(localStorage.getItem(RECOVERY_SNAPSHOT_KEY) || "null"),
    fallback.activeProfileId
  );
  if (snapshotMeds.length > 0) {
    fallback.medications = snapshotMeds;
    fallback.medications = fallback.medications.map((med) => fixMedicationDosePlan(med));
    return fallback;
  }

  const recovered = recoverLegacyMedications(fallback.activeProfileId);
  if (recovered.length > 0) {
    fallback.medications = recovered;
    fallback.medications = fallback.medications.map((med) => fixMedicationDosePlan(med));
  }
  return fallback;
}

function saveState() {
  const serialized = JSON.stringify(state);
  const nextMeds = Array.isArray(state.medications) ? state.medications : [];

  localStorage.setItem(STORAGE_KEY, serialized);
  localStorage.setItem(BACKUP_STORAGE_KEY, serialized);

  if (nextMeds.length > 0) {
    localStorage.setItem(MEDS_BACKUP_KEY, JSON.stringify(nextMeds));
    localStorage.setItem(RECOVERY_SNAPSHOT_KEY, serialized);
    return;
  }

  // Do not overwrite meds backup/snapshot with an empty list to avoid accidental data loss.
  const existingMedsBackup = parseJSON(localStorage.getItem(MEDS_BACKUP_KEY) || "null");
  if (!Array.isArray(existingMedsBackup)) {
    localStorage.setItem(MEDS_BACKUP_KEY, JSON.stringify([]));
  }
}

function getActiveProfile() {
  return state.profiles.find((profile) => profile.id === state.activeProfileId) || state.profiles[0];
}

function medsForActiveProfile() {
  return state.medications.filter((med) => med.profileId === state.activeProfileId);
}

function proceduresForActiveProfile() {
  return state.procedures.filter((procedure) => procedure.profileId === state.activeProfileId);
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function parseTimes(raw) {
  return String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(item));
}

function parseDosePlan(raw) {
  const plan = {};

  String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const [timeRaw, qtyRaw] = entry.split("=").map((item) => item.trim());
      const quantity = Number(qtyRaw);
      if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(timeRaw) || !Number.isFinite(quantity) || quantity <= 0) {
        return;
      }
      plan[timeRaw] = quantity;
    });

  return plan;
}

function normalizeDosePlan(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce((plan, [time, quantity]) => {
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
      return plan;
    }
    const normalizedQuantity = Number(quantity);
    if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
      return plan;
    }
    plan[time] = normalizedQuantity;
    return plan;
  }, {});
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

function parseWeeklyDays(raw) {
  return String(raw || "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
}

function isValidDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidPartialDate(value) {
  return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(value);
}

function procedureSortKey(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  if (/^\d{4}-\d{2}$/.test(value)) {
    return `${value}-00`;
  }
  if (/^\d{4}$/.test(value)) {
    return `${value}-00-00`;
  }
  return "0000-00-00";
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
  if (!isValidPartialDate(procedure.date)) {
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
  const procedures = proceduresForActiveProfile()
    .slice()
    .sort((a, b) => {
      const keyA = procedureSortKey(a.date || "");
      const keyB = procedureSortKey(b.date || "");
      if (keyA !== keyB) {
        return keyB.localeCompare(keyA);
      }
      return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
    });

  dom.procedureList.innerHTML = "";
  if (procedures.length === 0) {
    const empty = document.createElement("p");
    empty.className = "summary";
    empty.textContent = "No procedures recorded for this user yet.";
    dom.procedureList.appendChild(empty);
    return;
  }

  procedures.forEach((procedure) => {
    const node = dom.procedureTemplate.content.cloneNode(true);
    const summaryParts = [procedure.date, procedure.procedureName, procedure.doctorName].filter(Boolean);
    node.querySelector(".procedure-summary").textContent = summaryParts.join(" • ");

    node.querySelector(".procedure-edit-btn").addEventListener("click", () => {
      editingProcedureId = procedure.id;
      dom.procedureForm.procedureDate.value = procedure.date || "";
      dom.procedureForm.procedureName.value = procedure.procedureName || "";
      dom.procedureForm.procedureDoctorName.value = procedure.doctorName || "";
      dom.procedureForm.procedureNotes.value = procedure.notes || "";
      if (dom.procedureSubmitBtn) {
        dom.procedureSubmitBtn.textContent = "Save Changes";
      }
      if (dom.procedureCancelEditBtn) {
        dom.procedureCancelEditBtn.classList.remove("hidden");
      }
      dom.procedureMessage.textContent = `Editing procedure: ${procedure.procedureName}.`;
      dom.procedureForm.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    node.querySelector(".procedure-delete-btn").addEventListener("click", () => {
      const confirmed = window.confirm(`Delete procedure \"${procedure.procedureName}\" on ${procedure.date}?`);
      if (!confirmed) {
        return;
      }
      state.procedures = state.procedures.filter((entry) => entry.id !== procedure.id);
      saveState();
      dom.procedureMessage.textContent = "Procedure deleted.";
      renderAll();
    });

    dom.procedureList.appendChild(node);
  });
}

function renderRunningOut(meds) {
  const low = meds
    .map((med) => ({ med, left: daysLeft(med) }))
    .filter((item) => Number.isFinite(item.left) && item.left <= 7)
    .sort((a, b) => a.left - b.left);

  dom.runningOutList.innerHTML = "";
  if (low.length === 0) {
    dom.runningOutSummary.textContent = "No low-stock medications right now.";
    return;
  }

  dom.runningOutSummary.textContent = `${low.length} medication(s) need refill attention.`;
  low.forEach((item) => {
    const badge = document.createElement("span");
    badge.className = "chip";
    badge.textContent = `${item.med.name}: ${item.left.toFixed(1)} day(s) left`;
    dom.runningOutList.appendChild(badge);
  });
}

function renderOrderPriority(meds) {
  const profile = getActiveProfile();
  const labelName = (profile && profile.name ? profile.name : "Current user").trim();
  dom.orderUserName.textContent = `For: ${labelName}`;
  const ordered = meds
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
    });

  dom.orderList.innerHTML = "";
  if (ordered.length === 0) {
    dom.orderSummary.textContent = "No medications yet.";
    return;
  }

  const urgentCount = ordered.filter((item) => Number.isFinite(item.left) && item.left <= 7).length;
  dom.orderSummary.textContent = `${ordered.length} medication(s) sorted by days left. ${urgentCount} need ordering within a week.`;

  ordered.forEach((item) => {
    const li = document.createElement("li");
    const leftText = Number.isFinite(item.left) ? `${item.left.toFixed(1)} day(s) left` : "No schedule";
    li.textContent = `${item.med.name} ${item.med.strength || ""} - ${leftText} - Repeats: ${repeatsCount(item.med)}`.trim();
    dom.orderList.appendChild(li);
  });
}

function renderMeds(meds) {
  dom.medList.innerHTML = "";
  const sortedMeds = [...meds].sort((a, b) => {
    return a.name.localeCompare(b.name);
  });

  sortedMeds.forEach((med) => {
    const node = dom.medTemplate.content.cloneNode(true);
    node.querySelector(".med-photo").src = med.photoDataUrl || "icons/icon-192.svg";
    node.querySelector(".med-name").textContent = `${med.name} ${med.strength}`;
    node.querySelector(".med-purpose").textContent = `For: ${med.purpose}`;
    
    // Display times separately
    const timesText = med.frequency === "asRequired" 
      ? "As required (no schedule)" 
      : `Times: ${Array.isArray(med.times) && med.times.length > 0 ? med.times.join(", ") : "Not set"}`;
    node.querySelector(".med-times").textContent = timesText;
    
    // Display dose plan on separate line
    node.querySelector(".med-dose-plan").textContent = `Dose plan: ${formatDosePlan(med)}`;
    
    // Display food rule, frequency, repeats on separate line
    node.querySelector(".med-schedule").textContent = `${friendlyFoodRule(med.foodRule)} | ${friendlyFrequency(med.frequency)} | Repeats: ${repeatsCount(med)}`;
    
    const dl = daysLeft(med);
    const daysText = Number.isFinite(dl) ? `${dl.toFixed(1)} day(s) left` : `Stock: ${med.stock} ${doseUnit(med)}`;
    node.querySelector(".med-days").textContent = `${daysText}. ${refillFlag(med)}.`;
    node.querySelector(".med-notes").textContent = med.notes || "No notes";
    node.querySelector(".food-chip").textContent = friendlyFoodRule(med.foodRule);
    node.querySelector(".freq-chip").textContent = friendlyFrequency(med.frequency);
    node.querySelector(".form-chip").textContent = friendlyForm(med.form || "tablet");

    node.querySelector(".edit-btn").addEventListener("click", () => {
      editingMedicationId = med.id;
      dom.medForm.name.value = med.name || "";
      dom.medForm.strength.value = med.strength || "";
      dom.medForm.purpose.value = med.purpose || "";
      dom.medForm.stock.value = Number(med.stock || 0);
      dom.medForm.pillsPerDose.value = Number(med.pillsPerDose || 1);
      dom.medForm.dosePlan.value = serializeDosePlan(med);
      dom.medForm.repeats.value = repeatsCount(med);
      dom.medForm.startDate.value = med.startDate || toDateKey(new Date());
      dom.medForm.times.value = Array.isArray(med.times) ? med.times.join(", ") : "";
      dom.medForm.foodRule.value = med.foodRule || "none";
      dom.medForm.frequency.value = med.frequency || "daily";
      dom.medForm.weeklyDays.value = Array.isArray(med.weeklyDays) ? med.weeklyDays.join(",") : "";
      dom.medForm.barcode.value = med.barcode || "";
      dom.medForm.notes.value = med.notes || "";
      dom.medForm.form.value = med.form || "tablet";

      if (dom.medSubmitBtn) {
        dom.medSubmitBtn.textContent = "Save Changes";
      }
      if (dom.medCancelEditBtn) {
        dom.medCancelEditBtn.classList.remove("hidden");
      }
      dom.safetyMessage.textContent = `Editing ${med.name}. Update fields and click Save Changes.`;
      setTimeout(() => {
        const target = dom.medForm.closest("section.card") || dom.medForm;
        const targetTop = target.getBoundingClientRect().top + window.pageYOffset;
        const scrollTop = Math.max(0, targetTop - 12);
        const scroller = document.scrollingElement || document.documentElement || document.body;
        if (scroller && typeof scroller.scrollTo === "function") {
          scroller.scrollTo({ top: scrollTop, behavior: "auto" });
        }
        window.scrollTo(0, scrollTop);
        dom.medForm.name?.focus?.({ preventScroll: true });
      }, 100);
    });

    const prnBtn = node.querySelector(".log-prn-btn");
    if (med.frequency === "asRequired") {
      prnBtn.classList.remove("hidden");
      prnBtn.addEventListener("click", () => logPrnDose(med));
    }

    node.querySelector(".danger-btn").addEventListener("click", () => {
      state.medications = state.medications.filter((entry) => entry.id !== med.id);
      state.doses = state.doses.filter((entry) => entry.medId !== med.id);
      saveState();
      renderAll();
    });

    dom.medList.appendChild(node);
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
  dom.timeline.innerHTML = "";
  if (meds.length === 0) {
    dom.todaySummary.textContent = "No medications yet. Add one to enable reminders.";
    return;
  }

  const medMap = new Map(meds.map((med) => [med.id, med]));

  todayDoses.forEach((dose) => {
    const med = medMap.get(dose.medId);
    if (!med) {
      return;
    }
    const node = dom.timelineTemplate.content.cloneNode(true);
    node.querySelector(".time-title").textContent = `${dose.time} - ${getDoseQuantityForTime(med, dose.time)} ${doseUnit(med)}`;
    node.querySelector(".time-meta").textContent = `${med.name} ${med.strength} | ${friendlyFoodRule(med.foodRule)}`;
    node.querySelector(".time-datekey").textContent = `Scheduled date key: ${dose.dateKey}`;
    const takeBtn = node.querySelector(".take-btn");
    takeBtn.classList.toggle("pending", dose.status !== "taken");

    let stateLine = statusText(dose.status);
    if (dose.snoozedUntil) {
      stateLine += ` (snoozed until ${new Date(dose.snoozedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`;
    }
    node.querySelector(".time-state").textContent = stateLine;

    takeBtn.addEventListener("click", () => markDose(dose, "taken"));
    node.querySelector(".untake-btn").addEventListener("click", () => untakeDose(dose));
    node.querySelector(".skip-btn").addEventListener("click", () => markDose(dose, "skipped"));
    node.querySelector(".snooze-btn").addEventListener("click", () => snoozeDose(dose));

    dom.timeline.appendChild(node);
  });

  const taken = todayDoses.filter((dose) => dose.status === "taken").length;
  dom.todaySummary.textContent = `Today: ${taken} of ${todayDoses.length} doses taken.`;
}

function renderAdherence(todayDoses) {
  const now = new Date();
  const weekKeys = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    weekKeys.push(toDateKey(date));
  }

  const weekly = state.doses.filter((dose) => dose.profileId === state.activeProfileId && weekKeys.includes(dose.dateKey));
  const expected = weekly.length || 1;
  const taken = weekly.filter((dose) => dose.status === "taken").length;
  const score = Math.round((taken / expected) * 100);

  const missed = weekly.filter((dose) => dose.status === "skipped").length;
  let streak = 0;
  for (let i = 0; i < 30; i += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const key = toDateKey(date);
    const day = state.doses.filter((dose) => dose.profileId === state.activeProfileId && dose.dateKey === key);
    if (day.length === 0) {
      continue;
    }
    const allTaken = day.every((dose) => dose.status === "taken");
    if (allTaken) {
      streak += 1;
    } else {
      break;
    }
  }

  const overdue = overduePendingDoses();
  const overdueDates = new Set(overdue.map((dose) => dose.dateKey));
  const oldestOverdue = overdue.reduce((oldest, dose) => (dose.dateKey < oldest ? dose.dateKey : oldest), overdue[0]?.dateKey || "");

  dom.adherenceSummary.textContent = `Weekly adherence: ${score}%. Missed doses: ${missed}. Streak: ${streak} day(s).`;
  dom.trendList.innerHTML = "";

  const lateCount = todayDoses.filter((dose) => {
    if (dose.status !== "pending") {
      return false;
    }
    const due = new Date(`${dose.dateKey}T${dose.time}:00`);
    return Date.now() - due.getTime() > 60 * 60 * 1000;
  }).length;

  [
    `Overdue pending doses: ${overdue.length}${overdue.length ? ` across ${overdueDates.size} day(s)` : ""}`,
    overdue.length ? `Oldest overdue dose: ${oldestOverdue}` : "No overdue doses right now",
    `Today pending after 1 hour: ${lateCount}`,
    `Taken this week: ${taken}/${expected}`,
    `Use print summary for clinic visits`
  ].forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    dom.trendList.appendChild(li);
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
  const profileIds = new Set(state.profiles.map((profile) => profile.id));
  const activeId = getActiveProfile().id;
  let didMutate = false;

  state.medications.forEach((med) => {
    if (!med.profileId || !profileIds.has(med.profileId)) {
      med.profileId = activeId;
      didMutate = true;
    }
  });

  state.procedures.forEach((procedure) => {
    if (!procedure.profileId || !profileIds.has(procedure.profileId)) {
      procedure.profileId = activeId;
      didMutate = true;
    }
  });

  if (didMutate) {
    saveState();
  }
}

function renderAll() {
  recoverProfileMedicationVisibility();
  document.body.classList.toggle("high-contrast", Boolean(state.settings.highContrast));

  if (!ENABLE_POPUP_REMINDERS) {
    hideAlarm();
  }

  const meds = medsForActiveProfile();

  if (meds.length === 0) {
    hideAlarm();
  }

  const todayDoses = createDueDosesForDate(new Date());
  renderRunningOut(meds);
  renderOrderPriority(meds);
  renderMeds(meds);
  renderProcedures();
  renderTimeline(todayDoses, meds);
  renderAdherence(todayDoses);
  maybeNotifyRefill(meds);
  syncProfileForm();
  updateMedicalCard();
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
    .sort((a, b) => procedureSortKey(b.date || "").localeCompare(procedureSortKey(a.date || "")));

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
    .sort((a, b) => procedureSortKey(b.date || "").localeCompare(procedureSortKey(a.date || "")));
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
  const cards = Array.from(document.querySelectorAll("main section.card"));
  cards.forEach((card, index) => {
    if (card.dataset.collapsibleReady === "true") {
      return;
    }

    const heading = card.querySelector("h2");
    if (!heading) {
      return;
    }

    const panelId = card.id ? `${card.id}-content` : `card-content-${index + 1}`;
    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "card-toggle";
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.setAttribute("aria-controls", panelId);
    toggleBtn.innerHTML = `<span class="card-toggle-title">${heading.textContent || "Section"}</span><span class="card-toggle-icon" aria-hidden="true">▾</span>`;
    heading.replaceWith(toggleBtn);

    card.classList.add("is-collapsed");

    const content = document.createElement("div");
    content.className = "card-content";
    content.id = panelId;

    while (toggleBtn.nextSibling) {
      content.appendChild(toggleBtn.nextSibling);
    }
    card.appendChild(content);

    toggleBtn.addEventListener("click", () => {
      const collapsed = card.classList.toggle("is-collapsed");
      toggleBtn.setAttribute("aria-expanded", String(!collapsed));
    });

    card.dataset.collapsibleReady = "true";
  });
}

function bindEvents() {
  dom.profileForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const profile = getActiveProfile();
    const formData = new FormData(dom.profileForm);

    profile.name = String(formData.get("profileName") || "").trim() || profile.name;
    profile.emergencyPhone = String(formData.get("emergencyPhone") || "").trim();
    profile.caregiverName = String(formData.get("caregiverName") || "").trim();
    profile.caregiverPhone = String(formData.get("caregiverPhone") || "").trim();
    profile.doctorPhone = String(formData.get("doctorPhone") || "").trim();
    profile.pharmacyPhone = String(formData.get("pharmacyPhone") || "").trim();
    profile.bloodGroup = String(formData.get("bloodGroup") || "").trim();
    profile.conditions = String(formData.get("conditions") || "").trim();
    profile.allergies = String(formData.get("allergies") || "").trim();
    profile.voiceLang = String(formData.get("voiceLang") || "en-US").trim();

    saveState();
    renderAll();
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
    event.preventDefault();
    const formData = new FormData(dom.medForm);
    const photoFile = formData.get("photo");
    const photoDataUrl = photoFile instanceof File ? await fileToDataUrl(photoFile) : "";

    const existingMed = editingMedicationId ? state.medications.find((entry) => entry.id === editingMedicationId) : null;
    const startDateRaw = String(formData.get("startDate") || "").trim();
    const resolvedStartDate = startDateRaw || existingMed?.startDate || toDateKey(new Date());

    if (!isValidDateKey(resolvedStartDate)) {
      dom.safetyMessage.textContent = "Please choose a valid start date.";
      return;
    }

    let parsedDosePlan = parseDosePlan(formData.get("dosePlan"));
    const parsedTimes = parseTimes(formData.get("times"));
    const frequency = String(formData.get("frequency") || "daily");
    const isPrn = frequency === "asRequired";
    const pillsPerDose = Number(formData.get("pillsPerDose") || 1);

    if (!isPrn && parsedTimes.length > 0 && Object.keys(parsedDosePlan).length === 0) {
      parsedTimes.forEach((time) => {
        parsedDosePlan[time] = pillsPerDose;
      });
    }

    const med = {
      id: existingMed?.id || makeId(),
      profileId: existingMed?.profileId || state.activeProfileId,
      name: String(formData.get("name") || "").trim(),
      strength: String(formData.get("strength") || "").trim(),
      purpose: String(formData.get("purpose") || "").trim(),
      stock: Number(formData.get("stock") || 0),
      pillsPerDose: pillsPerDose,
      form: String(formData.get("form") || "tablet"),
      repeats: Math.max(0, Math.floor(Number(formData.get("repeats") || 0))),
      times: parsedTimes,
      dosePlan: parsedDosePlan,
      foodRule: String(formData.get("foodRule") || "none"),
      frequency: frequency,
      weeklyDays: parseWeeklyDays(formData.get("weeklyDays")),
      barcode: String(formData.get("barcode") || "").trim(),
      notes: String(formData.get("notes") || "").trim(),
      startDate: resolvedStartDate,
      photoDataUrl: photoDataUrl || existingMed?.photoDataUrl || ""
    };

    if (!med.name || !med.strength || !med.purpose || (!isPrn && med.times.length === 0)) {
      dom.safetyMessage.textContent = isPrn
        ? "Please fill required fields."
        : "Please fill required fields and valid time format HH:MM.";
      return;
    }
    if (Object.keys(med.dosePlan).some((time) => !med.times.includes(time))) {
      dom.safetyMessage.textContent = "Each dose plan time must also exist in the times field.";
      return;
    }
    if (isPrn) {
      med.times = [];
      med.dosePlan = {};
    }

    const safetyWarning = checkSafetyForNewMed(med, existingMed?.id || null);
    dom.safetyMessage.textContent = safetyWarning;
    if (existingMed) {
      state.medications = state.medications.map((entry) => (entry.id === existingMed.id ? med : entry));
    } else {
      state.medications.push(med);
    }
    saveState();
    dom.medForm.reset();
    resetMedicationEditMode();
    renderAll();
  });

  dom.medCancelEditBtn?.addEventListener("click", () => {
    dom.medForm.reset();
    resetMedicationEditMode();
    dom.safetyMessage.textContent = "Edit cancelled.";
  });

  dom.procedureForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(dom.procedureForm);
    const existingProcedure = editingProcedureId ? state.procedures.find((entry) => entry.id === editingProcedureId) : null;

    const procedure = {
      id: existingProcedure?.id || makeId(),
      profileId: existingProcedure?.profileId || state.activeProfileId,
      date: String(formData.get("procedureDate") || "").trim(),
      procedureName: String(formData.get("procedureName") || "").trim(),
      doctorName: String(formData.get("procedureDoctorName") || "").trim(),
      notes: String(formData.get("procedureNotes") || "").trim(),
      createdAt: existingProcedure?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const errorMessage = validateProcedureInput(procedure);
    dom.procedureMessage.textContent = errorMessage;
    if (errorMessage) {
      return;
    }

    if (existingProcedure) {
      state.procedures = state.procedures.map((entry) => (entry.id === existingProcedure.id ? procedure : entry));
      dom.procedureMessage.textContent = "Procedure updated.";
    } else {
      state.procedures.push(procedure);
      dom.procedureMessage.textContent = "Procedure saved.";
    }

    saveState();
    dom.procedureForm.reset();
    resetProcedureEditMode();
    renderAll();
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
