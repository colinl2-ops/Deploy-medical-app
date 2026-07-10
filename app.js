const STORAGE_KEY = "med-helper-v3";
const BACKUP_STORAGE_KEY = "med-helper-v3-backup";
const MEDS_BACKUP_KEY = "med-helper-meds-v1";
const RECOVERY_SNAPSHOT_KEY = "med-helper-recovery-v1";
const LEGACY_MED_LIST_KEY = "medications-v1";
const FORCE_RELOAD_MARKER = "1";
const ENABLE_POPUP_REMINDERS = false;
const APP_BUILD = "20260709-211626";
const APP_RELEASE_LABEL = "Refactor";
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

/** @type {ReturnType<typeof createStateApi>} */
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
  return stateApi.hasDosePlan(med);
}

function getDoseQuantityForTime(med, time) {
  return stateApi.getDoseQuantityForTime(med, time);
}

function formatDosePlan(med) {
  return stateApi.formatDosePlan(med);
}

function serializeDosePlan(med) {
  return stateApi.serializeDosePlan(med);
}

function fixMedicationDosePlan(med) {
  return stateApi.fixMedicationDosePlan(med);
}

function includesDay(med, date) {
  return stateApi.includesDay(med, date);
}

function pillsNeededPerDay(med) {
  return stateApi.pillsNeededPerDay(med);
}

function daysLeft(med) {
  return stateApi.daysLeft(med);
}

function doseId(medId, dateKey, time) {
  return stateApi.doseId(medId, dateKey, time);
}

function createDueDosesForDate(date) {
  return stateApi.createDueDosesForDate(state, date, {
    medsForActiveProfile,
    saveState,
    doseHistoryDays: DOSE_HISTORY_DAYS
  });
}

function findMed(medId) {
  return stateApi.findMed(state, medId);
}

function lastTakenForMed(medId) {
  return stateApi.lastTakenForMed(state, medId);
}

function minHoursBetweenDoses(med) {
  return stateApi.minHoursBetweenDoses(med);
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
  stateApi.snoozeDose(dose);
  saveState();
  hideAlarm();
  renderAll();
}

function untakeDose(dose) {
  stateApi.untakeDose(state, dose);
  saveState();
  hideAlarm();
  renderAll();
}

function logPrnDose(med) {
  const dose = stateApi.logPrnDose(state, med);
  renderAll();
  dom.safetyMessage.textContent = `Logged ${med.name} at ${dose.time}.`;
}

function overduePendingDoses() {
  return stateApi.overduePendingDoses(state);
}

function backfillRecentDoseHistory(days = DOSE_HISTORY_DAYS) {
  stateApi.backfillRecentDoseHistory(state, days, {
    medsForActiveProfile,
    saveState,
    doseHistoryDays: DOSE_HISTORY_DAYS
  });
}

function catchUpOverdueDoses() {
  const caughtUpCount = stateApi.catchUpOverdueDoses(state, {
    medsForActiveProfile,
    saveState,
    doseHistoryDays: DOSE_HISTORY_DAYS,
    days: DOSE_HISTORY_DAYS
  });

  if (caughtUpCount === 0) {
    dom.safetyMessage.textContent = "No overdue pending doses to catch up.";
    return;
  }

  renderAll();
  dom.safetyMessage.textContent = `Caught up ${caughtUpCount} overdue dose(s).`;
}

function isMorningDose(dose) {
  return stateApi.isMorningDose(dose);
}

function markAllByPeriodTaken(period) {
  const markedCount = stateApi.markAllByPeriodTaken(state, period, {
    medsForActiveProfile,
    saveState,
    doseHistoryDays: DOSE_HISTORY_DAYS
  });

  if (markedCount === 0) {
    dom.safetyMessage.textContent = `No ${period} doses to mark right now.`;
    return;
  }

  hideAlarm();
  renderAll();
  dom.safetyMessage.textContent = `Marked ${markedCount} ${period} dose(s) as taken.`;
}

function friendlyFoodRule(rule) {
  return stateApi.friendlyFoodRule(rule);
}

function doseUnit(med) {
  return stateApi.doseUnit(med);
}

function friendlyForm(form) {
  return stateApi.friendlyForm(form);
}

function friendlyFrequency(freq) {
  return stateApi.friendlyFrequency(freq);
}

function medDisplayLine(med) {
  return stateApi.medDisplayLine(med);
}

function repeatsCount(med) {
  return stateApi.repeatsCount(med);
}

function statusText(status) {
  return stateApi.statusText(status);
}

function refillFlag(med) {
  return stateApi.refillFlag(med);
}

function checkSafetyForNewMed(newMed, excludeMedId = null) {
  return stateApi.checkSafetyForNewMed(
    newMed,
    {
      existingMeds: medsForActiveProfile(),
      activeProfileAllergies: getActiveProfile().allergies,
      interactionRules: INTERACTION_RULES
    },
    excludeMedId
  );
}

function validateProcedureInput(procedure) {
  return stateApi.validateProcedureInput(procedure);
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
  const messages = stateApi.buildRefillAlertMessages(meds, REFILL_THRESHOLDS);
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
  dom.alarmMessage.textContent = stateApi.buildAlarmDisplayMessage(dose, med);
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
        if (stateApi.shouldEscalateAlarmMessage(dose, Date.now(), 15)) {
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
  const utterance = new SpeechSynthesisUtterance(stateApi.buildReminderSpeechText(med));
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

  const pending = stateApi.findPendingDueDose(today, now);

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
  return stateApi.emergencyDoseAbbrev(med);
}

function updateMedicalCard() {
  const profile = getActiveProfile();
  const meds = medsForActiveProfile();
  dom.medicalCardText.textContent = stateApi.buildMedicalCardText(profile, meds);
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
  return stateApi.caregiverStatusMessage(profile.name, today);
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
  const today = new Date();
  const visibleMeds = medsForActiveProfile();
  const rows = stateApi.buildMedicationCsvRows({
    visibleMeds,
    allDoses: state.doses,
    fallbackDoses: createDueDosesForDate(today),
    dateKey: toDateKey(today),
    findMedById: findMed
  });

  downloadTextFile("medication-history.csv", rows.join("\n"), "text/csv");
  dom.safetyMessage.textContent = `Exported ${Math.max(0, rows.length - 1)} row(s) to CSV.`;
}

function exportProceduresCsv() {
  const procedures = proceduresForActiveProfile();
  const rows = stateApi.buildProceduresCsvRows(procedures);

  downloadTextFile("procedure-history.csv", rows.join("\n"), "text/csv");
  dom.procedureMessage.textContent = `Exported ${procedures.length} procedure row(s) to CSV.`;
}

function exportMedList() {
  const profile = getActiveProfile();
  const meds = medsForActiveProfile();
  const procedures = proceduresForActiveProfile();
  const date = new Date();
  const dateLabel = date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const filename = stateApi.medicationListFilename(profile.name, toDateKey(date));
  const content = stateApi.buildMedicationListText(profile, meds, procedures, dateLabel);
  downloadTextFile(filename, content, "text/plain");
  dom.safetyMessage.textContent = `Medication list exported as ${filename}.`;
}

function exportAmPmList() {
  const profile = getActiveProfile();
  const meds = medsForActiveProfile();
  const date = new Date();
  const generatedLabel = date.toLocaleString();
  const filename = stateApi.amPmSummaryFilename(profile.name, toDateKey(date));
  const content = stateApi.buildAmPmSummaryText(profile, meds, generatedLabel);
  downloadTextFile(filename, content, "text/plain");
  dom.safetyMessage.textContent = `AM/PM medication summary exported as ${filename}.`;
}

function exportBackup() {
  downloadTextFile("medication-backup.json", JSON.stringify(state, null, 2), "application/json");
}

function normalizeImportedBackup(parsed) {
  return stateApi.normalizeImportedBackup(parsed, {
    makeId,
    todayDateKey: toDateKey(new Date())
  });
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
  return stateApi.forceParamState(window.location.search, FORCE_RELOAD_MARKER);
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
    const query = stateApi.forceReloadQuery(window.location.search, FORCE_RELOAD_MARKER);
    window.location.replace(`${window.location.pathname}?${query}`);
    return true;
  }

  return false;
}

function shouldRegisterServiceWorker() {
  return stateApi.shouldRegisterServiceWorker(window.location.search, FORCE_RELOAD_MARKER);
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
