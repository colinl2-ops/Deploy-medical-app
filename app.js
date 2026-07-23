const STORAGE_KEY = "med-helper-v3";
const BACKUP_STORAGE_KEY = "med-helper-v3-backup";
const LEGACY_MEDS_BACKUP_KEY = "med-helper-meds-v1";
const LEGACY_RECOVERY_SNAPSHOT_KEY = "med-helper-recovery-v1";
const LEGACY_MED_LIST_KEY = "medications-v1";
const BLOOD_PRESSURE_STORAGE_KEY = "med-helper-v3-blood-pressure";
const FORCE_RELOAD_MARKER = "1";
const ENABLE_POPUP_REMINDERS = false;
const APP_BUILD = "20260723-122407";
const APP_RELEASE_LABEL = "Flag 46";
const REFILL_THRESHOLDS = [7, 3, 1];
const DOSE_HISTORY_DAYS = 14;
const INTERACTION_RULES = [
  ["warfarin", "ibuprofen", "Possible bleeding risk when combined"],
  ["aspirin", "clopidogrel", "Blood thinner combination: verify with doctor"],
  ["lisinopril", "ibuprofen", "May reduce blood pressure medicine effect"]
];

const byId = (id) => document.getElementById(id);

function applyBloodPressureWrapStyle() {
  const style = document.createElement("style");
  style.textContent = `
    .bp-summary {
      white-space: pre-wrap !important;
      overflow-wrap: break-word;
      word-break: normal;
      overflow: visible;
      text-overflow: clip;
    }
    .procedure-card:has(.bp-summary) .procedure-main {
      min-width: 0;
    }
    .procedure-card:has(.bp-summary) .card-actions {
      width: auto;
      flex: 0 0 auto;
    }
  `;
  document.head.appendChild(style);
}

applyBloodPressureWrapStyle();

const dom = {
  medForm: byId("medForm"),
  medTimesPresetMenu: byId("medTimesPresetMenu"),
  medDosePlanPresetMenu: byId("medDosePlanPresetMenu"),
  medTimesPresetButton: document.querySelector("[data-timing-picker='medTimesPresetButton']"),
  medDosePlanPresetButton: document.querySelector("[data-timing-picker='medDosePlanPresetButton']"),
  procedureForm: byId("procedureForm"),
  bpForm: byId("bpForm"),
  profileForm: byId("profileForm"),
  medList: byId("medList"),
  procedureList: byId("procedureList"),
  bpList: byId("bpList"),
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
  bpTemplate: byId("bpCardTemplate"),
  timelineTemplate: byId("timelineItemTemplate"),
  installButton: byId("installAppBtn"),
  highContrastBtn: byId("highContrastBtn"),
  safetyMessage: byId("safetyMessage"),
  procedureMessage: byId("procedureMessage"),
  bpMessage: byId("bpMessage"),
  closeAllBtn: byId("closeAllBtn"),
  searchMedBtn: byId("searchMedBtn"),
  searchMedForm: byId("searchMedForm"),
  searchMedInput: byId("searchMedInput"),
  cancelSearchMedBtn: byId("cancelSearchMedBtn"),
  searchMedStatus: byId("searchMedStatus"),
  searchMedResults: byId("searchMedResults"),
  emergencyBtn: byId("emergencyBtn"),
  emergencyDialog: byId("emergencyDialog"),
  medicalCardText: byId("medicalCardText"),
  emergencyCallLink: byId("emergencyCallLink"),
  openLockScreenCardBtn: byId("openLockScreenCardBtn"),
  closeEmergencyBtn: byId("closeEmergencyBtn"),
  lockScreenCardDialog: byId("lockScreenCardDialog"),
  lockScreenCardName: byId("lockScreenCardName"),
  lockScreenCardText: byId("lockScreenCardText"),
  prnLogDialog: byId("prnLogDialog"),
  prnLogTitle: byId("prnLogTitle"),
  prnLogHint: byId("prnLogHint"),
  prnMinutesAgoInput: byId("prnMinutesAgoInput"),
  prnLogCancelBtn: byId("prnLogCancelBtn"),
  prnLogConfirmBtn: byId("prnLogConfirmBtn"),
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
  medSavedFlag: byId("medSavedFlag"),
  medCancelEditBtn: byId("medCancelEditBtn"),
  procedureSubmitBtn: byId("procedureSubmitBtn"),
  procedureCancelEditBtn: byId("procedureCancelEditBtn"),
  bpSubmitBtn: byId("bpSubmitBtn"),
  bpCancelEditBtn: byId("bpCancelEditBtn")
};

if (dom.buildInfo) {
  dom.buildInfo.textContent = `Build: ${APP_BUILD} | ${APP_RELEASE_LABEL}`;
}

/** @type {ReturnType<typeof createStateApi>} */
const stateApi = createStateApi({
  keys: {
    STORAGE_KEY,
    BACKUP_STORAGE_KEY,
    LEGACY_MEDS_BACKUP_KEY,
    LEGACY_RECOVERY_SNAPSHOT_KEY,
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
let editingBloodPressureId = null;
let medicationFormIsDirty = false;
let medicationFormSyncing = false;
let medicationStatusTimeoutId = null;
let medicationFormJumpTimeoutId = null;
let pendingPrnLogMedication = null;

function medicationFormHasPendingChanges() {
  return medicationFormIsDirty || editingMedicationId !== null;
}

function updateMedicationAbandonButtonState() {
  if (!dom.medCancelEditBtn) {
    return;
  }

  const shouldShow = medicationFormHasPendingChanges();
  dom.medCancelEditBtn.classList.toggle("hidden", !shouldShow);
  dom.medCancelEditBtn.textContent = "Abandon Changes";
}

function setMedicationFormDirty(isDirty) {
  medicationFormIsDirty = Boolean(isDirty);
  if (medicationFormIsDirty) {
    clearMedicationSavedStatus();
  }
  updateMedicationAbandonButtonState();
}

function flashMedicationStatus(message) {
  if (!dom.medSavedFlag) {
    return;
  }

  dom.medSavedFlag.textContent = message || "";
  dom.medSavedFlag.classList.remove("hidden");
  dom.medSavedFlag.classList.add("visible");
}

function clearMedicationSavedStatus() {
  if (!dom.medSavedFlag) {
    return;
  }

  dom.medSavedFlag.textContent = "";
  dom.medSavedFlag.classList.add("hidden");
  dom.medSavedFlag.classList.remove("visible");
}

function cancelMedicationFormJump() {
  if (medicationFormJumpTimeoutId) {
    clearTimeout(medicationFormJumpTimeoutId);
    medicationFormJumpTimeoutId = null;
  }
}

function scheduleMedicationFormJump(target) {
  cancelMedicationFormJump();
  medicationFormJumpTimeoutId = window.setTimeout(() => {
    medicationFormJumpTimeoutId = null;
    const resolvedTarget = target || document.getElementById("medFormTarget") || dom.medForm?.closest("section.card") || dom.medForm;
    if (!resolvedTarget) {
      return;
    }

    const targetTop = resolvedTarget.getBoundingClientRect().top + window.pageYOffset;
    const scrollTop = Math.max(0, targetTop - 12);
    if (resolvedTarget.id) {
      window.location.hash = resolvedTarget.id;
    }
    resolvedTarget.focus?.({ preventScroll: true });
    const scroller = document.scrollingElement || document.documentElement || document.body;
    if (scroller && typeof scroller.scrollTo === "function") {
      scroller.scrollTo({ top: scrollTop, behavior: "auto" });
    }
    window.scrollTo(0, scrollTop);
  }, 50);
}

function clearMedicationFormPreview() {
  try {
    const input = dom.medForm.querySelector('#photoInput');
    if (input) input.value = '';
    const removeCb = dom.medForm.querySelector('#removePhoto');
    if (removeCb) removeCb.checked = false;
    const preview = document.getElementById('photoPreview');
    if (preview) preview.src = 'icons/icon-192.svg';
  } catch (e) {}
}

function markMedicationFormDirty() {
  if (medicationFormSyncing) {
    return;
  }
  setMedicationFormDirty(true);
}

function medicationFormBlockMessage() {
  if (dom.safetyMessage) {
    dom.safetyMessage.textContent = "Save or abandon changes before leaving the medication form.";
  }
}

function canCollapseMedicationForm(card) {
  if (!card || !dom.medForm || !card.contains(dom.medForm)) {
    return true;
  }

  if (!medicationFormHasPendingChanges()) {
    return true;
  }

  medicationFormBlockMessage();
  return false;
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
    if (!canCollapseMedicationForm(card)) {
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

function normalizedSearchText(value) {
  return String(value || "").trim().toLowerCase();
}

function medicationSearchMatches(query) {
  const normalizedQuery = normalizedSearchText(query);
  if (!normalizedQuery) return [];

  const meds = medsForActiveProfile();
  const exactMatches = meds.filter((med) => normalizedSearchText(med.name) === normalizedQuery);
  if (exactMatches.length === 1) return exactMatches;

  return meds.filter((med) => normalizedSearchText(med.name).includes(normalizedQuery));
}

function closeMedicationSearch(message = "") {
  dom.searchMedForm?.classList.add("hidden");
  if (dom.searchMedInput) {
    dom.searchMedInput.blur?.();
    dom.searchMedInput.value = "";
  }
  if (dom.searchMedStatus) {
    dom.searchMedStatus.textContent = "";
  }
  if (dom.searchMedResults) {
    dom.searchMedResults.replaceChildren();
  }
  if (message && dom.safetyMessage) {
    dom.safetyMessage.textContent = message;
  }
}

function selectMedicationSearchMatch(med) {
  closeMedicationSearch(`Showing ${med.name}.`);
  rendererApi.jumpToMedication(med.id, { behavior: "auto", scrollDelay: 0, prioritize: true });
}

function renderMedicationSearchMatches(matches) {
  if (!dom.searchMedResults) {
    return;
  }

  dom.searchMedResults.replaceChildren();
  matches.forEach((med) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result-btn";
    button.textContent = `${med.name}${med.strength ? ` ${med.strength}` : ""}`;
    button.addEventListener("click", () => selectMedicationSearchMatch(med));
    dom.searchMedResults.appendChild(button);
  });
}

function openMedicationSearch() {
  cancelMedicationFormJump();
  dom.searchMedForm?.classList.remove("hidden");
  if (dom.searchMedStatus) {
    dom.searchMedStatus.textContent = "Type a medication name.";
  }
  dom.searchMedInput?.focus();
}

function resolveMedicationSearch() {
  cancelMedicationFormJump();
  const query = dom.searchMedInput?.value || "";
  const normalizedQuery = normalizedSearchText(query);
  if (!normalizedQuery) {
    dom.searchMedResults?.replaceChildren();
    if (dom.searchMedStatus) {
      dom.searchMedStatus.textContent = "Type a medication name.";
    }
    return;
  }

  const matches = medicationSearchMatches(query);
  renderMedicationSearchMatches(matches);

  if (dom.searchMedStatus) {
    dom.searchMedStatus.textContent = matches.length === 0
      ? "No medication found."
      : matches.length === 1
        ? "Tap the medicine to open it."
        : `${matches.length} matches. Tap the medicine you want.`;
  }
}

  function submitMedicationSearch() {
    const query = dom.searchMedInput?.value || "";
    const matches = medicationSearchMatches(query);
    if (matches.length === 1) {
      selectMedicationSearchMatch(matches[0]);
      return;
    }

    resolveMedicationSearch();
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
    emergencyContactName: "",
    emergencyPhone: "",
    caregiverName: "",
    caregiverPhone: "",
    doctorPhone: "",
    pharmacyPhone: "",
    bloodGroup: "",
    conditions: "",
    allergies: "",
    voiceLang: "en-US",
    timingPresets: [
      { key: "wake_up", label: "When I wake up", time: "07:00" },
      { key: "before_breakfast", label: "Half hour before breakfast", time: "07:30" },
      { key: "breakfast", label: "Breakfast", time: "08:00" },
      { key: "mid_morning", label: "Mid morning", time: "10:00" },
      { key: "mid_afternoon", label: "Mid afternoon", time: "15:00" },
      { key: "dinner", label: "Dinner", time: "18:00" },
      { key: "sleep", label: "Before going to sleep", time: "22:00" }
    ]
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

function activeMedsForActiveProfile() {
  if (typeof stateApi.activeMedsForActiveProfile === "function") {
    return stateApi.activeMedsForActiveProfile(state);
  }
  return medsForActiveProfile().filter((med) => med.status !== "stopped");
}

function proceduresForActiveProfile() {
  return stateApi.proceduresForActiveProfile(state);
}

function bloodPressureLogsForActiveProfile() {
  if (typeof stateApi.bloodPressureLogsForActiveProfile === "function") {
    return stateApi.bloodPressureLogsForActiveProfile(state);
  }

  const savedLogs = parseJSON(localStorage.getItem(BLOOD_PRESSURE_STORAGE_KEY) || "[]");
  return Array.isArray(savedLogs) ? savedLogs.filter((entry) => entry.profileId === state.activeProfileId) : [];
}

function saveBloodPressureLogs() {
  const savedLogs = Array.isArray(state.bloodPressureLogs) ? state.bloodPressureLogs : [];
  localStorage.setItem(BLOOD_PRESSURE_STORAGE_KEY, JSON.stringify(savedLogs));
}

function handleBloodPressureSubmitFallback(event) {
  event.preventDefault();
  const formData = new FormData(dom.bpForm);
  const timestampRaw = String(formData.get("readingTimestamp") || "").trim();
  const pressure = String(formData.get("pressure") || "").trim();
  const pulseRaw = String(formData.get("pulse") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  const timestamp = new Date(timestampRaw);

  if (!timestampRaw || Number.isNaN(timestamp.getTime()) || !pressure) {
    dom.bpMessage.textContent = "Please enter a date and time and pressure.";
    return;
  }

  const pulse = pulseRaw === "" ? "" : Number(pulseRaw);
  if (pulseRaw !== "" && (!Number.isFinite(pulse) || pulse <= 0)) {
    dom.bpMessage.textContent = "Please enter a valid pulse, or leave it blank.";
    return;
  }

  const logs = bloodPressureLogsForActiveProfile();
  const existingReading = editingBloodPressureId ? logs.find((entry) => entry.id === editingBloodPressureId) : null;
  const savedAt = new Date().toISOString();
  const reading = {
    id: existingReading?.id || makeId(),
    profileId: existingReading?.profileId || state.activeProfileId,
    timestamp: timestamp.toISOString(),
    pressure,
    pulse: pulse === "" ? "" : String(Math.round(pulse)),
    notes,
    createdAt: existingReading?.createdAt || savedAt,
    updatedAt: savedAt
  };

  state.bloodPressureLogs = existingReading
    ? logs.map((entry) => (entry.id === existingReading.id ? reading : entry))
    : [...logs, reading];
  saveBloodPressureLogs();
  saveState();
  dom.bpMessage.textContent = existingReading ? "Blood pressure reading updated." : "Blood pressure reading saved.";
  resetBloodPressureForm();
  resetBloodPressureEditMode();
  renderAll();
}

function toDateKey(date) {
  const localYear = date.getFullYear();
  const localMonth = String(date.getMonth() + 1).padStart(2, '0');
  const localDay = String(date.getDate()).padStart(2, '0');
  return `${localYear}-${localMonth}-${localDay}`;
}

function parseDosePlan(raw) {
  return stateApi.parseDosePlan(raw, getActiveProfile().timingPresets);
}

function parseTimes(raw) {
  return stateApi.parseTimes(raw, getActiveProfile().timingPresets);
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
  return stateApi.formatDosePlan(med, getActiveProfile().timingPresets);
}

function activeTimingPresets() {
  return stateApi.parseTimingPresets(getActiveProfile().timingPresets);
}

function liveTimingPickerMenu(id) {
  return document.getElementById(id);
}

function liveTimingPickerButton(selector) {
  return document.querySelector(selector);
}

function populateTimingPresetMenu(menu, presets, onSelect) {
  if (!menu) {
    return;
  }

  menu.innerHTML = "";
  presets.forEach((preset) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "timing-picker-option";
    option.textContent = `${preset.label} (${preset.time})`;
    option.addEventListener("click", () => {
      onSelect?.(preset);
    });
    menu.appendChild(option);
  });

  if (presets.length === 0) {
    const empty = document.createElement("span");
    empty.className = "muted";
    empty.textContent = "No timing labels are set up for this profile.";
    menu.appendChild(empty);
  }
}

function refreshTimingPresetPickers() {
  const presets = activeTimingPresets();
  const timesMenu = liveTimingPickerMenu("medTimesPresetMenu");
  const doseMenu = liveTimingPickerMenu("medDosePlanPresetMenu");
  const timesButton = liveTimingPickerButton("[data-timing-picker='medTimesPresetButton']");
  const doseButton = liveTimingPickerButton("[data-timing-picker='medDosePlanPresetButton']");

  populateTimingPresetMenu(timesMenu, presets, (preset) => {
    appendScheduleToken(dom.medForm?.times, preset.label);
    closeTimingPresetMenus();
    updateMedicationSubmitState();
  });
  populateTimingPresetMenu(doseMenu, presets, (preset) => {
    const pillsPerDose = Number(dom.medForm?.pillsPerDose?.value || 1);
    const suffix = Number.isFinite(pillsPerDose) && pillsPerDose > 0 ? `=${pillsPerDose}` : "=1";
    appendScheduleToken(dom.medForm?.dosePlan, preset.label, suffix);
    closeTimingPresetMenus();
    updateMedicationSubmitState();
  });
  if (timesButton) {
    timesButton.disabled = presets.length === 0;
  }
  if (doseButton) {
    doseButton.disabled = presets.length === 0;
  }
}

function closeTimingPresetMenus() {
  [liveTimingPickerMenu("medTimesPresetMenu"), liveTimingPickerMenu("medDosePlanPresetMenu")].forEach((menu) => {
    if (menu) {
      menu.hidden = true;
    }
  });
  [liveTimingPickerButton("[data-timing-picker='medTimesPresetButton']"), liveTimingPickerButton("[data-timing-picker='medDosePlanPresetButton']")].forEach((button) => {
    if (button) {
      button.setAttribute("aria-expanded", "false");
    }
  });
}

function toggleTimingPresetMenu(menuId, buttonSelector) {
  const menu = liveTimingPickerMenu(menuId);
  const button = liveTimingPickerButton(buttonSelector);
  if (!menu || !button || button.disabled) {
    return;
  }

  const shouldOpen = menu.hidden;
  closeTimingPresetMenus();
  menu.hidden = !shouldOpen ? true : false;
  button.setAttribute("aria-expanded", String(shouldOpen));
}

function appendScheduleToken(field, token, suffix = "") {
  if (!field || !token) {
    return;
  }

  const current = String(field.value || "").trim();
  const nextToken = suffix ? `${token}${suffix}` : token;
  if (!current) {
    field.value = nextToken;
    return;
  }

  const separator = current.endsWith(",") ? " " : ", ";
  field.value = `${current}${separator}${nextToken}`;
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
    if (previous?.timestamp && !options.force) {
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
  pendingPrnLogMedication = med;
  if (dom.prnLogTitle) {
    dom.prnLogTitle.textContent = `Log ${med.name}`;
  }
  if (dom.prnLogHint) {
    dom.prnLogHint.textContent = `Enter how many minutes ago you took ${med.name}.`;
  }
  if (dom.prnMinutesAgoInput) {
    dom.prnMinutesAgoInput.value = "0";
    dom.prnMinutesAgoInput.focus();
    dom.prnMinutesAgoInput.select();
  }
  if (dom.prnLogDialog && typeof dom.prnLogDialog.showModal === "function") {
    dom.prnLogDialog.showModal();
    return;
  }

  dom.safetyMessage.textContent = "Unable to open the PRN log dialog.";
}

function submitPrnLogDose() {
  const med = pendingPrnLogMedication;
  if (!med) {
    return;
  }

  const minutesAgo = Number(String(dom.prnMinutesAgoInput?.value || "0").trim());
  if (!Number.isFinite(minutesAgo) || minutesAgo < 0) {
    dom.safetyMessage.textContent = "Please enter a valid number of minutes ago, or cancel.";
    dom.prnMinutesAgoInput?.focus();
    return;
  }

  const dose = stateApi.logPrnDose(state, med, { minutesAgo });
  pendingPrnLogMedication = null;
  dom.prnLogDialog?.close();
  renderAll();
  dom.safetyMessage.textContent = minutesAgo > 0
    ? `Logged ${med.name} ${minutesAgo} minute${minutesAgo === 1 ? "" : "s"} ago at ${dose.time}.`
    : `Logged ${med.name} at ${dose.time}.`;
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
    updateCatchUpButtonState();
    dom.safetyMessage.textContent = "No overdue pending doses to catch up.";
    return;
  }

  renderAll();
  dom.safetyMessage.textContent = `Caught up ${caughtUpCount} overdue dose(s).`;
}

function updateCatchUpButtonState() {
  if (!dom.catchUpBtn) {
    return;
  }

  const overdueCount = overduePendingDoses().length;
  dom.catchUpBtn.disabled = overdueCount === 0;
  dom.catchUpBtn.textContent = overdueCount === 0 ? "Caught Up" : "Catch Up Overdue";
  dom.catchUpBtn.setAttribute(
    "aria-label",
    overdueCount === 0 ? "All overdue doses are caught up" : `Catch up ${overdueCount} overdue dose${overdueCount === 1 ? "" : "s"}`
  );
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

function friendlyWeeklyDays(days) {
  return stateApi.friendlyWeeklyDays(days);
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

function currentDatetimeLocalValue() {
  const now = new Date();
  const offsetMilliseconds = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMilliseconds).toISOString().slice(0, 16);
}

function resetBloodPressureForm() {
  if (!dom.bpForm) {
    return;
  }

  dom.bpForm.reset();
  const timestampField = dom.bpForm.querySelector('[name="readingTimestamp"]');
  if (timestampField) {
    timestampField.value = currentDatetimeLocalValue();
  }
}

function resetBloodPressureEditMode() {
  editingBloodPressureId = null;
  if (dom.bpSubmitBtn) {
    dom.bpSubmitBtn.textContent = "Save Reading";
  }
  dom.bpCancelEditBtn?.classList.add("hidden");
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

function renderBloodPressureLogs() {
  const logs = bloodPressureLogsForActiveProfile();
  state.bloodPressureLogs = logs.slice();
  rendererApi.renderBloodPressureLogs(logs, {
    dom,
    setEditingBloodPressureId: (id) => {
      editingBloodPressureId = id;
    },
    state,
    saveState: () => {
      saveBloodPressureLogs();
      saveState();
    },
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
    formatTimeWithLabel: (time) => stateApi.profileTimingLabelForTime(getActiveProfile(), time),
    includesDay,
    friendlyFoodRule,
    friendlyFrequency,
    friendlyWeeklyDays,
    repeatsCount,
    doseUnit,
    refillFlag,
    friendlyForm,
    timingPresets: getActiveProfile().timingPresets,
    beginMedicationFormSync: () => {
      medicationFormSyncing = true;
    },
    endMedicationFormSync: () => {
      medicationFormSyncing = false;
    },
    clearMedicationFormDirty: () => {
      setMedicationFormDirty(false);
    },
    clearMedicationSavedStatus,
    cancelMedicationFormJump,
    scheduleMedicationFormJump,
    setEditingMedicationId: (id) => {
      editingMedicationId = id;
    },
    serializeDosePlan,
    toDateKey,
    openMedicationFormCard,
    refreshMedicationSubmitState: updateMedicationSubmitState,
    logPrnDose,
    lastTakenForMed,
    minHoursBetweenDoses,
    toggleMedicationStatus,
    state,
    saveState,
    renderAll
  });
}

function toggleMedicationStatus(med) {
  if (!med) {
    return;
  }

  med.status = med.status === "stopped" ? "active" : "stopped";
  saveState();
  renderAll();
  dom.safetyMessage.textContent = med.status === "stopped"
    ? `${med.name} marked as Stopped. It stays in the Medication List but is hidden from reminders and the Emergency Card.`
    : `${med.name} reactivated.`;
}

function medicationRequiredFieldsComplete(form) {
  if (!form) {
    return false;
  }
  const requiredSelector = "[required], [data-required='true']";
  let requiredFields = Array.from(form.querySelectorAll(requiredSelector));

  // If frequency is "asRequired" then the times field is not required.
  try {
    const frequency = String((form.frequency && form.frequency.value) || "").trim();
    if (frequency === "asRequired") {
      requiredFields = requiredFields.filter((field) => !(field.name === "times"));
    }
  } catch (e) {
    // ignore and proceed with original required fields
  }

  if (requiredFields.length === 0) {
    return true;
  }

  return requiredFields.every((field) => String(field.value || "").trim().length > 0);
}

function medicationValidationState(form) {
  const missingFields = [];
  let firstInvalidField = null;
  if (!form) {
    return { valid: false, missingFields, firstInvalidField };
  }

  const requiredSelector = "[required], [data-required='true']";
  let requiredFields = Array.from(form.querySelectorAll(requiredSelector));

  try {
    const frequency = String((form.frequency && form.frequency.value) || "").trim();
    if (frequency === "asRequired") {
      requiredFields = requiredFields.filter((field) => !(field.name === "times"));
    }
  } catch (e) {
    // ignore and proceed with original required fields
  }

  requiredFields.forEach((field) => {
    if (!String(field.value || "").trim()) {
      if (!firstInvalidField) {
        firstInvalidField = field;
      }
      const row = field.closest(".form-row") || field.parentElement;
      const label = row?.querySelector("label")?.textContent?.replace(/Required/g, "").trim()
        || field.getAttribute("aria-label")
        || field.name
        || "Required field";
      if (!missingFields.includes(label)) {
        missingFields.push(label);
      }
    }
  });

  if (String(form.frequency?.value || "").trim() === "asRequired") {
    const gapField = form.minGapHours;
    const gapHours = Number(gapField?.value);
    if (gapField && String(gapField.value || "").trim() !== "" && (!Number.isFinite(gapHours) || gapHours < 0)) {
      if (!firstInvalidField) {
        firstInvalidField = gapField;
      }
      if (!missingFields.includes("Minimum gap between doses")) {
        missingFields.push("Minimum gap between doses");
      }
    }
  }

  return { valid: missingFields.length === 0, missingFields, firstInvalidField };
}

function updateMedicationSubmitState() {
  if (!dom.medSubmitBtn || !dom.medForm) {
    return;
  }
  const validation = medicationValidationState(dom.medForm);
  const disabled = !validation.valid;
  dom.medSubmitBtn.disabled = disabled;
  dom.medSubmitBtn.setAttribute("aria-disabled", String(disabled));
  if (dom.safetyMessage) {
    dom.safetyMessage.textContent = validation.valid
      ? ""
      : `Please fill: ${validation.missingFields.join(", ")}.`;
  }
}

function resetMedicationEditMode() {
  editingMedicationId = null;
  setMedicationFormDirty(false);
  if (dom.medSubmitBtn) {
    dom.medSubmitBtn.textContent = "Save Medication";
  }
  if (dom.medCancelEditBtn) {
    dom.medCancelEditBtn.classList.add("hidden");
  }
  if (dom.medForm?.startDate) {
    dom.medForm.startDate.value = toDateKey(new Date());
  }
  updateMedicationSubmitState();
  updateMedicationAbandonButtonState();
}

function abandonMedicationChanges() {
  medicationFormSyncing = true;
  dom.medForm.reset();
  resetMedicationEditMode();
  clearMedicationFormPreview();
  flashMedicationStatus("Changes abandoned.");
  if (dom.safetyMessage) {
    dom.safetyMessage.textContent = "";
  }
  updateMedicationSubmitState();
  medicationFormSyncing = false;
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
  updateCatchUpButtonState();
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
  dom.alarmMessage.textContent = stateApi.buildAlarmDisplayMessage(dose, med, getActiveProfile().timingPresets);
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
  form.emergencyContactName.value = profile.emergencyContactName || "";
  form.emergencyPhone.value = profile.emergencyPhone || "";
  form.caregiverName.value = profile.caregiverName || "";
  form.caregiverPhone.value = profile.caregiverPhone || "";
  form.doctorPhone.value = profile.doctorPhone || "";
  form.pharmacyPhone.value = profile.pharmacyPhone || "";
  form.bloodGroup.value = profile.bloodGroup || "";
  form.conditions.value = profile.conditions || "";
  form.allergies.value = profile.allergies || "";
  form.voiceLang.value = profile.voiceLang || "en-US";
  if (form.timingPresets) {
    form.timingPresets.value = stateApi.formatTimingPresets(profile.timingPresets);
  }
  refreshTimingPresetPickers();

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
  const meds = activeMedsForActiveProfile();
  const emergencyContact = [profile.emergencyContactName, profile.emergencyPhone]
    .filter(Boolean)
    .join(": ") || "Not recorded";
  dom.medicalCardText.textContent = stateApi.buildMedicalCardText(profile, meds);
  dom.lockScreenCardName.textContent = profile.name || "Medical Card";
  dom.lockScreenCardText.textContent = [
    `Emergency contact: ${emergencyContact}`,
    "",
    `Blood group: ${profile.bloodGroup || "Unknown"}`,
    `Conditions: ${profile.conditions || "None known"}`,
    `Allergies: ${profile.allergies || "None known"}`,
    "",
    meds.length
      ? `Medicines: ${meds.map((med) => `${med.frequency === "asRequired" ? "* " : ""}${med.name} ${med.strength}${emergencyDoseAbbrev(med)}`).join("; ")}`
      : "Medicines: None recorded"
  ].join("\n");
  dom.emergencyCallLink.href = profile.emergencyPhone ? `tel:${profile.emergencyPhone}` : "#";
}

function fitLockScreenCardText() {
  const text = dom.lockScreenCardText;
  text.style.fontSize = "";
  for (let size = 15; size >= 10; size -= 1) {
    text.style.fontSize = `${size}px`;
    if (text.scrollHeight <= text.clientHeight) return;
  }
}

function recoverProfileMedicationVisibility() {
  stateApi.recoverProfileMedicationVisibility(state, {
    getActiveProfile,
    saveState
  });
}

function renderAll() {
  const activeMeds = activeMedsForActiveProfile();
  const allMeds = medsForActiveProfile();
  rendererApi.renderAll({
    recoverProfileMedicationVisibility,
    state,
    enablePopupReminders: ENABLE_POPUP_REMINDERS,
    hideAlarm,
    medsForActiveProfile: activeMedsForActiveProfile,
    createDueDosesForDate,
    renderRunningOut: () => renderRunningOut(activeMeds),
    renderOrderPriority: () => renderOrderPriority(activeMeds),
    renderMeds: () => renderMeds(allMeds),
    renderProcedures,
    renderBloodPressureLogs,
    renderTimeline: (todayDoses, meds) => renderTimeline(todayDoses, activeMeds),
    renderAdherence,
    maybeNotifyRefill: () => maybeNotifyRefill(activeMeds),
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
    // The largest the app ever displays a medication photo is the preview
    // dialog (max-width 540px). Thumbnails are only 86px. Storing far more
    // resolution than that just wastes localStorage space, so always resize
    // down to MAX_DIM and always re-encode as compressed JPEG (never keep
    // the original file bytes, even if it was already small - an
    // uncompressed screenshot/PNG can still be large).
    const MAX_DIM = 640;
    const JPEG_QUALITY = 0.6;
    const reader = new FileReader();
    reader.onerror = () => resolve("");
    reader.onload = () => {
      try {
        const img = new Image();
        img.onload = () => {
          const { width, height } = img;
          const ratio = Math.min(1, MAX_DIM / Math.max(width, height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(width * ratio));
          canvas.height = Math.max(1, Math.round(height * ratio));
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          try {
            const compressed = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
            resolve(compressed);
          } catch (e) {
            resolve(String(reader.result || ""));
          }
        };
        img.onerror = () => resolve(String(reader.result || ""));
        img.src = String(reader.result || "");
      } catch (e) {
        resolve(String(reader.result || ""));
      }
    };
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
  const backup = {
    schemaVersion: 2,
    state
  };
  downloadTextFile("medication-backup.json", JSON.stringify(backup, null, 2), "application/json");
}

function normalizeImportedBackup(parsed) {
  return stateApi.normalizeImportedBackup(parsed, {
    makeId,
    todayDateKey: toDateKey(new Date())
  });
}

function restoreImportedBackup(parsed) {
  return stateApi.restoreImportedBackup(parsed, {
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
    const restored = restoreImportedBackup(parsed);
    if (!restored) {
      throw new Error("Invalid backup file");
    }
    state = restored;
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
  if (medicationFormHasPendingChanges()) {
    medicationFormBlockMessage();
    return;
  }
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
      if (collapsed && !canCollapseMedicationForm(card)) {
        card.classList.remove("is-collapsed");
        toggleBtn.setAttribute("aria-expanded", "true");
        return;
      }
      toggleBtn.setAttribute("aria-expanded", String(!collapsed));
    });

    card.dataset.collapsibleReady = "true";
  });
}

// Ensure collapse toggles work even if per-button listeners are lost
let cardToggleDelegationBound = false;
function bindCardToggleDelegation() {
  if (cardToggleDelegationBound) return;
  cardToggleDelegationBound = true;
  document.addEventListener('click', (ev) => {
    const tgt = ev.target;
    if (!(tgt instanceof Element)) return;
    const toggle = tgt.closest('.card-toggle');
    if (!toggle) return;
    const card = toggle.closest('section.card');
    if (!card) return;
    const collapsed = card.classList.toggle('is-collapsed');
    if (collapsed && !canCollapseMedicationForm(card)) {
      card.classList.remove('is-collapsed');
      toggle.setAttribute('aria-expanded', 'true');
      return;
    }
    toggle.setAttribute('aria-expanded', String(!collapsed));
    renderAll();
  });
}

function attachPerToggleListeners() {
  const toggles = Array.from(document.querySelectorAll('.card-toggle'));
  toggles.forEach((toggle) => {
    if (toggle.dataset.toggleListener === 'true') return;
    toggle.addEventListener('click', () => {
      const card = toggle.closest('section.card');
      if (!card) return;
      const collapsed = card.classList.toggle('is-collapsed');
      if (collapsed && !canCollapseMedicationForm(card)) {
        card.classList.remove('is-collapsed');
        toggle.setAttribute('aria-expanded', 'true');
        return;
      }
      toggle.setAttribute('aria-expanded', String(!collapsed));
      renderAll();
    });
    toggle.dataset.toggleListener = 'true';
  });
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
  function decorateCompulsoryFields() {
    const requiredSelector = "[required], [data-required='true']";
    document.querySelectorAll("form").forEach((form) => {
      form.querySelectorAll(requiredSelector).forEach((el) => {
        const row = el.closest(".form-row") || el.parentElement;
        if (!row) return;

        row.classList.add("compulsory-field");

        const chipHost = row.querySelector(".required-row") || row;

        if (!row.querySelector(".compulsory-chip")) {
          const chip = document.createElement("span");
          chip.className = "compulsory-chip";
          chip.textContent = "Required";
          chipHost.insertBefore(chip, chipHost.firstChild);
        }
      });
    });
  }

  decorateCompulsoryFields();

  function syncTimesRequirement() {
    const freqField = dom.medForm?.frequency;
    const timesField = dom.medForm?.times;
    const gapField = dom.medForm?.minGapHours;
    const gapRow = gapField?.closest("label");
    if (!freqField || !timesField) {
      return;
    }

    const isPrn = String(freqField.value || "").trim() === "asRequired";
    const row = timesField.closest(".form-row") || timesField.parentElement;
    const chipHost = row?.querySelector(".required-row") || row;

    if (isPrn) {
      timesField.removeAttribute("required");
      timesField.removeAttribute("data-required");
      if (row) {
        row.classList.remove("compulsory-field");
        const chip = chipHost?.querySelector(".compulsory-chip");
        if (chip) {
          chip.remove();
        }
      }
    } else {
      timesField.setAttribute("required", "");
      timesField.setAttribute("data-required", "true");
      if (row) {
        row.classList.add("compulsory-field");
        if (chipHost && !chipHost.querySelector(".compulsory-chip")) {
          const chip = document.createElement("span");
          chip.className = "compulsory-chip";
          chip.textContent = "Required";
          chipHost.insertBefore(chip, chipHost.firstChild);
        }
      }
    }

    if (gapField) {
      if (isPrn) {
        gapRow?.classList.remove("hidden");
      } else {
        gapRow?.classList.add("hidden");
      }
    }

    updateMedicationSubmitState();
  }

  function syncDosePlanToTimes() {
    const form = dom.medForm;
    if (!form || !form.dosePlan) {
      return;
    }
    const currentTimes = parseTimes(form.times?.value || "");
    const currentPlan = parseDosePlan(form.dosePlan.value || "");
    if (Object.keys(currentPlan).length === 0) {
      return;
    }
    Object.keys(currentPlan).forEach((t) => {
      if (!currentTimes.includes(t)) delete currentPlan[t];
    });
    const ppd = Number(form.pillsPerDose?.value || 1);
    const remaining = Object.values(currentPlan);
    if (remaining.length === 0 || remaining.every((v) => v === ppd)) {
      form.dosePlan.value = "";
    } else {
      form.dosePlan.value = Object.entries(currentPlan)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([t, q]) => `${t}=${q}`)
        .join(", ");
    }
  }

  function syncDosePlanToPillsPerDose() {
    const form = dom.medForm;
    if (!form || !form.dosePlan) {
      return;
    }
    const currentPlan = parseDosePlan(form.dosePlan.value || "");
    const values = Object.values(currentPlan);
    if (values.length === 0) {
      return;
    }
    if (values.every((v) => v === values[0])) {
      form.dosePlan.value = "";
    }
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("[data-timing-picker='medTimesPresetButton']")) {
      toggleTimingPresetMenu("medTimesPresetMenu", "[data-timing-picker='medTimesPresetButton']");
      return;
    }
    if (target?.closest("[data-timing-picker='medDosePlanPresetButton']")) {
      toggleTimingPresetMenu("medDosePlanPresetMenu", "[data-timing-picker='medDosePlanPresetButton']");
      return;
    }
    if (!target?.closest(".timing-picker-row") && !target?.closest(".timing-picker-menu")) {
      closeTimingPresetMenus();
    }
  }, true);

  dom.medForm?.frequency?.addEventListener("change", syncTimesRequirement);
  dom.medForm?.times?.addEventListener("blur", syncDosePlanToTimes);
  dom.medForm?.pillsPerDose?.addEventListener("change", syncDosePlanToPillsPerDose);
  dom.medForm?.addEventListener("input", markMedicationFormDirty);
  dom.medForm?.addEventListener("change", markMedicationFormDirty);
  dom.medForm?.addEventListener("reset", () => {
    window.setTimeout(syncTimesRequirement, 0);
  });
  syncTimesRequirement();

  dom.profileForm.addEventListener("submit", (event) => {
    getActiveProfile().emergencyContactName = String(dom.profileForm.emergencyContactName.value || "").trim();
    formsApi.handleProfileSubmit(event, {
      dom,
      getActiveProfile,
      parseTimingPresets: stateApi.parseTimingPresets,
      saveState,
      renderAll
    });
  });

  dom.addProfileBtn.addEventListener("click", () => {
    if (medicationFormHasPendingChanges()) {
      medicationFormBlockMessage();
      return;
    }
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

  function markValidationErrors(form) {
    const validation = medicationValidationState(form);
    const requiredSelector = "[required], [data-required='true']";
    form.querySelectorAll(requiredSelector).forEach((el) => {
      const val = String(el.value || "").trim();
      const row = el.closest(".form-row") || el.parentElement;
      let msg = row && row.querySelector && row.querySelector(".error-message");
      if (!msg && row) {
        msg = document.createElement("div");
        msg.className = "error-message";
        row.appendChild(msg);
      }
      if (!val) {
        el.classList.add("field-error");
        if (msg) { msg.textContent = "Required"; msg.classList.add("visible"); }
      } else {
        el.classList.remove("field-error");
        if (msg) { msg.classList.remove("visible"); }
      }
      el.addEventListener("input", () => {
        if (String(el.value || "").trim()) {
          el.classList.remove("field-error");
          if (msg) msg.classList.remove("visible");
        }
      }, { once: false });
    });
    return validation;
  }

  dom.medForm.addEventListener("input", updateMedicationSubmitState);
  dom.medForm.addEventListener("change", updateMedicationSubmitState);

  dom.medForm.addEventListener("submit", async (event) => {
    // Client-side highlight for required fields; stop submission if invalid.
    const validation = markValidationErrors(dom.medForm);
    if (!validation.valid) {
      event.preventDefault();
      const missingText = validation.missingFields.length > 0
        ? `Please fill: ${validation.missingFields.join(", ")}.`
        : "Please fill required fields.";
      dom.safetyMessage.textContent = missingText;
      const toolbar = document.getElementById("medFormToolbar");
      toolbar?.scrollIntoView({ behavior: "smooth", block: "start" });
      validation.firstInvalidField?.focus?.({ preventScroll: true });
      validation.firstInvalidField?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      return;
    }
    await formsApi.handleMedicationSubmit(event, {
      dom,
      state,
      editingMedicationId,
      fileToDataUrl,
      toDateKey,
      isValidDateKey: stateApi.isValidDateKey,
      parseDosePlan,
      parseTimes,
      parseWeeklyDays: stateApi.parseWeeklyDays,
      makeId,
      checkSafetyForNewMed,
      saveState,
      resetMedicationEditMode,
      renderAll
    });
    updateMedicationSubmitState();
  });

  // Update photo preview when user selects a file and clear remove flag
  const photoInput = dom.medForm.querySelector('#photoInput');
  if (photoInput) {
    photoInput.addEventListener('change', async (ev) => {
      try {
        const file = photoInput.files && photoInput.files[0];
        const preview = document.getElementById('photoPreview');
        if (file) {
          const data = await fileToDataUrl(file);
          if (preview) preview.src = data || 'icons/icon-192.svg';
          const removeCb = dom.medForm.querySelector('#removePhoto');
          if (removeCb) removeCb.checked = false;
        } else if (preview) {
          preview.src = 'icons/icon-192.svg';
        }
      } catch (e) {}
    });
  }

  // Photo preview dialog handlers
  const photoDialog = byId('photoPreviewDialog');
  const photoDialogImage = byId('photoDialogImage');
  const photoReplaceBtn = byId('photoReplaceBtn');
  const photoRemoveBtn = byId('photoRemoveBtn');
  const photoCloseBtn = byId('photoCloseBtn');

  // Track which med the dialog was opened for (null = form preview, string = med card)
  let photoDialogMedId = null;

  // Open dialog when clicking preview images
  document.addEventListener('click', (ev) => {
    const tgt = ev.target;
    if (!(tgt instanceof Element)) return;
    if (tgt.id === 'photoPreview' || tgt.classList.contains('med-photo')) {
      const src = tgt.getAttribute('src') || 'icons/icon-192.svg';
      if (photoDialogImage) photoDialogImage.src = src;
      photoDialogMedId = tgt.dataset.medId || null;
      if (photoDialog && typeof photoDialog.showModal === 'function') photoDialog.showModal();
    }
  });

  if (photoReplaceBtn) {
    photoReplaceBtn.addEventListener('click', () => {
      if (photoDialog && typeof photoDialog.close === 'function') photoDialog.close();
      if (photoDialogMedId) {
        // Clicked from a med card — enter edit mode for that med, then open file picker
        const editBtn = document.querySelector(`.med-photo[data-med-id="${photoDialogMedId}"]`)
          ?.closest('.med-card')
          ?.querySelector('.edit-btn');
        if (editBtn) {
          editBtn.click();
          // Wait for the form to scroll into view, then open file picker
          setTimeout(() => {
            const input = dom.medForm.querySelector('#photoInput');
            if (input) input.click();
          }, 350);
        }
      } else {
        // Clicked from the form preview — just open file picker directly
        const input = dom.medForm.querySelector('#photoInput');
        if (input) input.click();
      }
      photoDialogMedId = null;
    });
  }

  if (photoRemoveBtn) {
    photoRemoveBtn.addEventListener('click', () => {
      if (photoDialog && typeof photoDialog.close === 'function') photoDialog.close();
      if (photoDialogMedId) {
        // Clicked from a med card — directly remove photo from state and save
        const med = state.medications.find((m) => m.id === photoDialogMedId);
        if (med) {
          const prevPhoto = med.photoDataUrl || "";
          med.photoDataUrl = "";
          saveState();
          renderAll();
          if (prevPhoto) {
            try { window.__photoUndo?.showUndoForRemoval(med.id, prevPhoto); } catch (e) {}
          }
        }
      } else {
        // Clicked from the form preview — check the remove checkbox
        const removeCb = dom.medForm.querySelector('#removePhoto');
        if (removeCb) removeCb.checked = true;
        const preview = byId('photoPreview');
        if (preview) preview.src = 'icons/icon-192.svg';
      }
      photoDialogMedId = null;
    });
  }

  if (photoCloseBtn) {
    photoCloseBtn.addEventListener('click', () => {
      if (photoDialog && typeof photoDialog.close === 'function') photoDialog.close();
      photoDialogMedId = null;
    });
  }

  // Undo toast for photo removal
  const undoToast = byId('undoToast');
  const undoToastBtn = byId('undoToastBtn');
  const undoToastMessage = byId('undoToastMessage');
  let undoTimeoutId = null;
  const photoUndoStore = new Map();
  if (undoToastBtn) {
    undoToastBtn.addEventListener('click', () => {
      // restore last removed photo if available
      const lastKey = Array.from(photoUndoStore.keys()).pop();
      if (!lastKey) return;
      const data = photoUndoStore.get(lastKey);
      if (!data) return;
      const med = state.medications.find((m) => m.id === lastKey);
      if (med) {
        med.photoDataUrl = data;
        saveState();
        renderAll();
      }
      photoUndoStore.delete(lastKey);
      if (undoToast) undoToast.classList.add('hidden');
      if (undoTimeoutId) { clearTimeout(undoTimeoutId); undoTimeoutId = null; }
    });
  }

  // Helper to show undo toast when a photo is removed
  function showUndoForRemoval(medId, previousData) {
    if (!medId) return;
    photoUndoStore.set(medId, previousData || "");
    if (undoToastMessage) undoToastMessage.textContent = 'Photo removed';
    if (undoToast) undoToast.classList.remove('hidden');
    if (undoTimeoutId) clearTimeout(undoTimeoutId);
    undoTimeoutId = setTimeout(() => {
      photoUndoStore.delete(medId);
      if (undoToast) undoToast.classList.add('hidden');
      undoTimeoutId = null;
    }, 5000);
  }

  // Expose for other modules to call when they remove a photo
  window.__photoUndo = { showUndoForRemoval };

  // Storage usage check: warn when approaching localStorage quota
  function estimateLocalStorageBytes() {
    try {
      let total = 0;
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        const val = localStorage.getItem(key) || "";
        total += key.length + val.length;
      }
      return total;
    } catch (e) {
      return 0;
    }
  }

  function checkStorageWarning() {
    const bytes = estimateLocalStorageBytes();
    // warn at ~4.5MB (approx 4.5 * 1024 * 1024)
    const threshold = 4.5 * 1024 * 1024;
    const warnEl = byId('storageWarning');
    if (bytes > threshold) {
      if (warnEl) {
        warnEl.textContent = 'Storage usage is high — photos may fail to save. Consider removing large images.';
        warnEl.classList.remove('hidden');
      }
    } else if (warnEl) {
      warnEl.classList.add('hidden');
    }
  }

  // run on startup and when saving
  try { checkStorageWarning(); } catch (e) {}
  window.__checkStorageWarning = checkStorageWarning;

  dom.medCancelEditBtn?.addEventListener("click", () => {
    abandonMedicationChanges();
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

  dom.bpForm?.addEventListener("submit", (event) => {
    if (typeof formsApi.handleBloodPressureSubmit !== "function") {
      handleBloodPressureSubmitFallback(event);
      return;
    }

    formsApi.handleBloodPressureSubmit(event, {
      dom,
      state,
      editingBloodPressureId,
      makeId,
      saveState,
      resetBloodPressureEditMode,
      renderAll
    });
  });

  dom.bpCancelEditBtn?.addEventListener("click", () => {
    resetBloodPressureForm();
    resetBloodPressureEditMode();
    dom.bpMessage.textContent = "Edit cancelled.";
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
  dom.searchMedBtn?.addEventListener("click", openMedicationSearch);
  dom.searchMedInput?.addEventListener("input", resolveMedicationSearch);
  dom.searchMedForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitMedicationSearch();
  });
  dom.cancelSearchMedBtn?.addEventListener("click", () => closeMedicationSearch("Search cancelled."));
  dom.searchMedInput?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMedicationSearch("Search cancelled.");
    }
  });
  dom.emergencyBtn.addEventListener("click", () => dom.emergencyDialog.showModal());
  dom.closeEmergencyBtn.addEventListener("click", () => dom.emergencyDialog.close());
  dom.openLockScreenCardBtn.addEventListener("click", () => {
    dom.emergencyDialog.close();
    dom.lockScreenCardDialog.showModal();
    fitLockScreenCardText();
  });
  dom.lockScreenCardDialog.addEventListener("click", (event) => {
    if (event.target === dom.lockScreenCardDialog) {
      dom.lockScreenCardDialog.close();
    }
  });
  dom.prnLogCancelBtn?.addEventListener("click", () => {
    pendingPrnLogMedication = null;
    dom.prnLogDialog?.close();
  });
  dom.prnLogConfirmBtn?.addEventListener("click", submitPrnLogDose);
  dom.prnLogDialog?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitPrnLogDose();
    }
  });
  dom.prnLogDialog?.addEventListener("close", () => {
    pendingPrnLogMedication = null;
  });

  window.addEventListener("beforeunload", (event) => {
    if (!medicationFormHasPendingChanges()) {
      return;
    }

    event.preventDefault();
    event.returnValue = "";
  });

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

  updateMedicationSubmitState();
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

window.__medicationFormTestApi = {
  medicationFormHasPendingChanges,
  setMedicationFormDirty,
  abandonMedicationChanges,
  requestCloseAllWindows,
  switchUser,
  getActiveProfileId: () => state.activeProfileId,
  clearMedicationSavedStatus,
  cancelMedicationFormJump,
  scheduleMedicationFormJump,
  setEditingMedicationId: (id) => {
    editingMedicationId = id;
  }
};

if (!window.__skipAppBootstrap) {
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
    setupCollapsibleCards();
    bindCardToggleDelegation();
    attachPerToggleListeners();
    bindEvents();
    resetProcedureEditMode();
    resetBloodPressureForm();
    resetBloodPressureEditMode();
    renderAll();
    if (ENABLE_POPUP_REMINDERS) {
      window.setInterval(checkDueAlarms, 30000);
    }
  });
}
