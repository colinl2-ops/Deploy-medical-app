(function (global) {
  function createStateApi(config) {
    const keys = config.keys;
    const helpers = config.helpers;
    const DEFAULT_TIMING_PRESETS = [
      { key: "wake_up", label: "When I wake up", time: "07:00" },
      { key: "before_breakfast", label: "Half hour before breakfast", time: "07:30" },
      { key: "breakfast", label: "Breakfast", time: "08:00" },
      { key: "mid_morning", label: "Mid morning", time: "10:00" },
      { key: "mid_afternoon", label: "Mid afternoon", time: "15:00" },
      { key: "dinner", label: "Dinner", time: "18:00" },
      { key: "sleep", label: "Before going to sleep", time: "22:00" }
    ];

    const buildDefaultState = function() {
      const first = helpers.defaultProfile();
      return { profiles: [first], activeProfileId: first.id, medications: [], procedures: [], doses: [], settings: { highContrast: false } };
    };

    const validTimePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

    function normalizeTimingLabel(value) {
      return String(value || "").trim().replace(/\s+/g, " ");
    }

    function slugifyTimingLabel(value) {
      return normalizeTimingLabel(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    }

    function normalizeTimingTime(value) {
      const time = normalizeTimingLabel(value);
      return validTimePattern.test(time) ? time : "";
    }

    function normalizeTimingPresetEntry(entry) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const label = normalizeTimingLabel(entry.label || entry.name || entry.key);
      const time = normalizeTimingTime(entry.time || entry.value);
      if (!label || !time) {
        return null;
      }

      return {
        key: slugifyTimingLabel(entry.key || label),
        label,
        time
      };
    }

    function normalizeTimingPresets(value, options = {}) {
      if (value == null) {
        return options.defaultIfMissing === false ? [] : DEFAULT_TIMING_PRESETS.map((preset) => ({ ...preset }));
      }

      let entries = [];
      if (Array.isArray(value)) {
        entries = value;
      } else if (typeof value === "object") {
        entries = Object.entries(value).map(([label, time]) => ({ label, time }));
      } else if (typeof value === "string") {
        entries = String(value)
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const separatorIndex = line.indexOf("=") >= 0 ? line.indexOf("=") : line.indexOf(":");
            if (separatorIndex < 0) {
              return null;
            }
            return {
              label: line.slice(0, separatorIndex).trim(),
              time: line.slice(separatorIndex + 1).trim()
            };
          })
          .filter(Boolean);
      }

      const seenLabels = new Set();
      const seenTimes = new Set();
      const normalized = [];

      entries.forEach((entry) => {
        const normalizedEntry = normalizeTimingPresetEntry(entry);
        if (!normalizedEntry) {
          return;
        }
        const labelKey = normalizedEntry.key;
        if (seenLabels.has(labelKey) || seenTimes.has(normalizedEntry.time)) {
          return;
        }
        seenLabels.add(labelKey);
        seenTimes.add(normalizedEntry.time);
        normalized.push(normalizedEntry);
      });

      return normalized;
    }

    function timingPresetLookup(presets) {
      const normalized = normalizeTimingPresets(presets, { defaultIfMissing: false });
      const byLabel = new Map();
      const byKey = new Map();
      const byTime = new Map();

      normalized.forEach((preset) => {
        byLabel.set(normalizeTimingLabel(preset.label).toLowerCase(), preset.time);
        byKey.set(preset.key, preset.time);
        byTime.set(preset.time, preset.label);
      });

      return { presets: normalized, byLabel, byKey, byTime };
    }

    function resolveScheduledTime(value, timingPresets) {
      const token = normalizeTimingLabel(value);
      if (!token) {
        return "";
      }
      if (validTimePattern.test(token)) {
        return token;
      }

      const lookup = timingPresetLookup(timingPresets);
      const normalizedToken = token.toLowerCase();
      return lookup.byLabel.get(normalizedToken) || lookup.byKey.get(slugifyTimingLabel(token)) || "";
    }

    function formatTimeWithLabel(time, timingPresets) {
      const normalizedTime = normalizeTimingTime(time);
      if (!normalizedTime) {
        return normalizeTimingLabel(time);
      }

      const lookup = timingPresetLookup(timingPresets);
      const label = lookup.byTime.get(normalizedTime);
      return label ? `${normalizedTime} - ${label}` : normalizedTime;
    }

    function formatTimingPresets(timingPresets) {
      return normalizeTimingPresets(timingPresets, { defaultIfMissing: false })
        .map((preset) => `${preset.label}=${preset.time}`)
        .join("\n");
    }

    function normalizeDoseDateKey(dose) {
      if (!dose || !dose.timestamp) {
        return dose;
      }

      const timestampDate = new Date(dose.timestamp);
      if (Number.isNaN(timestampDate.getTime())) {
        return dose;
      }

      const normalizedDateKey = helpers.toDateKey(timestampDate);
      if (!normalizedDateKey || normalizedDateKey === dose.dateKey) {
        return dose;
      }

      const normalized = { ...dose, dateKey: normalizedDateKey };
      if (dose.medId && dose.time) {
        if (String(dose.id || "").includes("|prn-")) {
          const suffixIndex = String(dose.id).indexOf("|prn-");
          normalized.id = `${dose.medId}|${normalizedDateKey}${String(dose.id).slice(suffixIndex)}`;
        } else {
          normalized.id = `${dose.medId}|${normalizedDateKey}|${dose.time}`;
        }
      }

      return normalized;
    }

    const normalizeState = function(parsed) {
      if (!parsed || !Array.isArray(parsed.profiles) || parsed.profiles.length === 0) return null;
      const profiles = parsed.profiles.map((profile) => ({
        ...profile,
        timingPresets: normalizeTimingPresets(profile.timingPresets)
      }));
      const resolvedActiveProfileId = profiles.some((profile) => profile.id === parsed.activeProfileId) ? parsed.activeProfileId : profiles[0].id;
      const migratedMeds = (parsed.medications || []).map((med) => ({
        ...med,
        profileId: med.profileId || resolvedActiveProfileId,
        status: med.status === "stopped" ? "stopped" : "active"
      }));
      const migratedDoses = (parsed.doses || []).map((dose) => normalizeDoseDateKey({ ...dose, profileId: dose.profileId || resolvedActiveProfileId }));
      const migratedProcedures = (parsed.procedures || []).map((procedure) => ({ ...procedure, profileId: procedure.profileId || resolvedActiveProfileId }));
      return { profiles, activeProfileId: resolvedActiveProfileId, medications: migratedMeds, procedures: migratedProcedures, doses: migratedDoses, settings: parsed.settings || { highContrast: false } };
    };

    const recoverLegacyMedications = function(activeProfileId) {
      const legacy = helpers.parseJSON(localStorage.getItem(keys.LEGACY_MED_LIST_KEY) || "null");
      if (!Array.isArray(legacy) || legacy.length === 0) return [];
      return legacy.map((item) => ({ id: item.id || helpers.makeId(), profileId: activeProfileId, name: item.name || "Medication", strength: item.dose || "", purpose: "Imported from older app", stock: 0, pillsPerDose: 1, form: "tablet", repeats: 0, times: ["08:00"], foodRule: "none", frequency: "daily", weeklyDays: [], barcode: "", notes: item.notes || "", startDate: helpers.toDateKey(new Date()), photoDataUrl: "", status: "active" }));
    };

    const recoverRetiredMedsBackup = function(activeProfileId) {
      const backup = helpers.parseJSON(localStorage.getItem(keys.LEGACY_MEDS_BACKUP_KEY) || "null");
      if (!Array.isArray(backup) || backup.length === 0) return [];
      return backup.filter((item) => item && typeof item === "object" && item.name).map((item) => ({ id: item.id || helpers.makeId(), profileId: item.profileId || activeProfileId, name: item.name || "Medication", strength: item.strength || item.dose || "", purpose: item.purpose || "Imported from backup", stock: Number(item.stock ?? 0), pillsPerDose: Number(item.pillsPerDose ?? 1), form: item.form || "tablet", repeats: Number(item.repeats ?? 0), times: Array.isArray(item.times) && item.times.length > 0 ? item.times : ["08:00"], foodRule: item.foodRule || "none", frequency: item.frequency || "daily", weeklyDays: Array.isArray(item.weeklyDays) ? item.weeklyDays : [], barcode: item.barcode || "", notes: item.notes || "", startDate: item.startDate || helpers.toDateKey(new Date()), photoDataUrl: item.photoDataUrl || "", status: item.status === "stopped" ? "stopped" : "active" }));
    };

    const finalizeLoadedState = function(loadedState) {
      loadedState.medications = loadedState.medications.map((med) => helpers.fixMedicationDosePlan(med));
      return loadedState;
    };

    const loadState = function() {
      const primary = normalizeState(helpers.parseJSON(localStorage.getItem(keys.STORAGE_KEY) || "null"));
      if (primary) return finalizeLoadedState(primary);

      const backup = normalizeState(helpers.parseJSON(localStorage.getItem(keys.BACKUP_STORAGE_KEY) || "null"));
      if (backup) return finalizeLoadedState(backup);

      const retiredSnapshot = normalizeState(helpers.parseJSON(localStorage.getItem(keys.LEGACY_RECOVERY_SNAPSHOT_KEY) || "null"));
      if (retiredSnapshot) return finalizeLoadedState(retiredSnapshot);

      const fallback = buildDefaultState();
      const retiredMeds = recoverRetiredMedsBackup(fallback.activeProfileId);
      if (retiredMeds.length > 0) {
        fallback.medications = retiredMeds;
        return finalizeLoadedState(fallback);
      }

      const legacyMeds = recoverLegacyMedications(fallback.activeProfileId);
      if (legacyMeds.length > 0) {
        fallback.medications = legacyMeds;
      }
      return finalizeLoadedState(fallback);
    };

    const saveState = function(state) {
      // Photos are the dominant storage cost. Keep them only in the primary
      // store; the single recovery copy stays small enough for localStorage.
      const stripPhotos = (meds) => meds.map((med) => (med && med.photoDataUrl ? { ...med, photoDataUrl: "" } : med));

      const tryWrite = (obj) => {
        const nextMeds = Array.isArray(obj.medications) ? obj.medications : [];
        const lightMeds = stripPhotos(nextMeds);
        const lightState = { ...obj, medications: lightMeds };
        const serialized = JSON.stringify(obj);
        const lightSerialized = JSON.stringify(lightState);
        localStorage.setItem(keys.STORAGE_KEY, serialized);
        localStorage.setItem(keys.BACKUP_STORAGE_KEY, lightSerialized);
        localStorage.removeItem(keys.LEGACY_MEDS_BACKUP_KEY);
        localStorage.removeItem(keys.LEGACY_RECOVERY_SNAPSHOT_KEY);
        localStorage.removeItem(keys.LEGACY_MED_LIST_KEY);
      };

      try {
        tryWrite(state);
        return;
      } catch (e) {
        // Likely quota exceeded. Attempt a graceful trim: remove photoDataUrl from all meds and retry.
        try {
          const trimmed = JSON.parse(JSON.stringify(state));
          if (Array.isArray(trimmed.medications)) {
            trimmed.medications.forEach((m) => { if (m && m.photoDataUrl) m.photoDataUrl = ""; });
          }
          trimmed.settings = trimmed.settings || {};
          trimmed.settings.photoStorageTrimmed = true;
          tryWrite(trimmed);
          return;
        } catch (e2) {
          try {
            const minimal = { profiles: state.profiles || [], activeProfileId: state.activeProfileId, medications: [], procedures: state.procedures || [], doses: state.doses || [], settings: state.settings || {} };
            tryWrite(minimal);
          } catch (e3) {
            // Give up silently; there is nothing further we can do here.
          }
        }
      }
    };

    function getActiveProfile(state) {
      return state.profiles.find((profile) => profile.id === state.activeProfileId) || state.profiles[0];
    }

    function medsForActiveProfile(state) {
      return state.medications.filter((med) => med.profileId === state.activeProfileId);
    }

    function activeMedsForActiveProfile(state) {
      return medsForActiveProfile(state).filter((med) => med.status !== "stopped");
    }

    function proceduresForActiveProfile(state) {
      return state.procedures.filter((procedure) => procedure.profileId === state.activeProfileId);
    }

    function parseTimes(raw, timingPresets = []) {
      return String(raw || "")
        .split(",")
        .map((item) => item.trim())
        .map((item) => resolveScheduledTime(item, timingPresets))
        .filter((item) => validTimePattern.test(item));
    }

    function parseDosePlan(raw, timingPresets = []) {
      const plan = {};

      String(raw || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((entry) => {
          const [timeRaw, qtyRaw] = entry.split("=").map((item) => item.trim());
          const quantity = Number(qtyRaw);
          const resolvedTime = resolveScheduledTime(timeRaw, timingPresets);
          if (!validTimePattern.test(resolvedTime) || !Number.isFinite(quantity) || quantity <= 0) {
            return;
          }
          plan[resolvedTime] = quantity;
        });

      return plan;
    }

    const normalizeDosePlan = function(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return {};
      return Object.entries(value).reduce((plan, [time, quantity]) => {
        if (!validTimePattern.test(time)) return plan;
        const normalizedQuantity = Number(quantity);
        if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) return plan;
        plan[time] = normalizedQuantity;
        return plan;
      }, {});
    };

    const hasDosePlan = function(med) { return Boolean(med && med.dosePlan && Object.keys(med.dosePlan).length > 0); };

    const getDoseQuantityForTime = function(med, time) {
      const fallback = Number(med?.pillsPerDose ?? 1);
      const planned = Number(med?.dosePlan?.[time]);
      if (Number.isFinite(planned) && planned > 0) return planned;
      if (Number.isFinite(planned) && planned === -1) return -1;
      return Number.isFinite(fallback) && fallback > 0 ? fallback : 1;
    };

    const doseUnit = function(med) {
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
    };

    const friendlyFoodRule = function(rule) {
      if (rule === "before") return "Before food";
      if (rule === "after") return "After food";
      if (rule === "with") return "With food";
      return "No food rule";
    };

    const friendlyForm = function(form) {
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
    };

    const friendlyFrequency = function(freq) {
      if (freq === "twiceDaily") return "Twice daily";
      if (freq === "everyOtherDay") return "Every other day";
      if (freq === "weekly") return "Weekly";
      if (freq === "asRequired") return "As required";
      return "Daily";
    };

    const friendlyWeeklyDays = function(days) {
      const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      if (!Array.isArray(days) || days.length === 0) return "";
      return days.slice().sort((a,b)=>a-b).map((d)=>names[d]||"").filter(Boolean).join(", ");
    };

    const formatDosePlan = function(med, timingPresets = []) {
      if (med.frequency === "asRequired") return `${Number(med.pillsPerDose || 1)} ${doseUnit(med)}`;
      const times = Array.isArray(med.times) ? med.times : [];
      if (times.length === 0) return `No schedule - ${Number(med.pillsPerDose || 1)} ${doseUnit(med)}`;
      return times
        .map((time) => {
          const qty = getDoseQuantityForTime(med, time);
          const qtyText = qty === -1 ? "(not set)" : `${qty} ${doseUnit(med)}`;
          return `${formatTimeWithLabel(time, timingPresets)} ${qtyText}`;
        })
        .join(", ");
    };

    const medDisplayLine = function(med, timingPresets = []) {
      if (med.frequency === "asRequired") return `As required - ${med.pillsPerDose} ${doseUnit(med)}`;
      return formatDosePlan(med, timingPresets);
    };

    const statusText = function(status) {
      if (status === "taken") return "Taken";
      if (status === "skipped") return "Skipped";
      return "Pending";
    };

    const medicationStatusLabel = function(med) {
      return med && med.status === "stopped" ? "Stopped" : "Active";
    };

    const serializeDosePlan = function(med) {
      if (!hasDosePlan(med)) return "";
      return Object.entries(med.dosePlan)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([time, quantity]) => `${time}=${quantity}`)
        .join(", ");
    };

    const fixMedicationDosePlan = function(med) {
      if (med.frequency === "asRequired") {
        med.dosePlan = {};
        med.times = [];
      } else if (Array.isArray(med.times) && med.times.length > 0) {
        const fallback = Number(med.pillsPerDose ?? 1);
        const newPlan = {};
        med.times.forEach((time) => {
          if (med.dosePlan?.[time]) newPlan[time] = med.dosePlan[time]; else newPlan[time] = fallback;
        });
        med.dosePlan = newPlan;
        try { console.log(`Fixed ${med.name}: dosePlan now =`, med.dosePlan); } catch (e) {}
      }
      return med;
    };

    const pillsNeededPerDay = function(med) {
      if (med.frequency === "asRequired") return 0;
      const timesCount = Math.max(1, med.times.length);
      const fallbackDose = Number(med.pillsPerDose) || 1;
      const scheduledTotal = med.times.reduce((sum, time) => sum + getDoseQuantityForTime(med, time), 0);
      const base = med.frequency === "twiceDaily" && med.times.length < 2
        ? scheduledTotal + (Math.max(timesCount, 2) - med.times.length) * fallbackDose
        : (scheduledTotal || fallbackDose * timesCount);
      if (med.frequency === "everyOtherDay") return base / 2;
      if (med.frequency === "weekly") {
        const weeklyDays = med.weeklyDays?.length ? med.weeklyDays.length : 1;
        return (base * weeklyDays) / 7;
      }
      return base;
    };

    const daysLeft = function(med) { const needed = pillsNeededPerDay(med); if (needed <= 0) return Infinity; return Number(med.stock) / needed; };

    const doseId = function(medId, dateKey, time) { return `${medId}|${dateKey}|${time}`; };

    function prnMinGapHours(med) {
      const explicitGap = Number(med?.minGapHours);
      if (Number.isFinite(explicitGap) && explicitGap >= 0) {
        return explicitGap;
      }
      return 0;
    }

    function minHoursBetweenDoses(med) {
      if (med.frequency === "asRequired") {
        return prnMinGapHours(med);
      }
      const dailyNeed = pillsNeededPerDay(med);
      if (dailyNeed <= 0) {
        return 24;
      }
      return 24 / dailyNeed;
    }

    const includesDay = function(med, date) {
      const start = new Date(`${med.startDate}T00:00:00`);
      const targetDateKey = date.toISOString().slice(0, 10);
      const target = new Date(`${targetDateKey}T00:00:00`);
      const dayDiff = Math.floor((target - start) / (1000 * 60 * 60 * 24));
      if (dayDiff < 0) return false;
      if (med.frequency === "asRequired") return false;
      if (med.frequency === "everyOtherDay") return dayDiff % 2 === 0;
      if (med.frequency === "weekly") {
        const weekly = med.weeklyDays || [];
        if (weekly.length === 0) return target.getDay() === start.getDay();
        return weekly.includes(target.getDay());
      }
      return true;
    };

    function findMed(state, medId) {
      return state.medications.find((med) => med.id === medId);
    }

    function lastTakenForMed(state, medId) {
      return state.doses
        .filter((dose) => dose.medId === medId && dose.status === "taken" && dose.timestamp)
        .sort((a, b) => {
          const entryTimeA = String(a.loggedAt || a.createdAt || a.timestamp || "");
          const entryTimeB = String(b.loggedAt || b.createdAt || b.timestamp || "");
          return entryTimeB.localeCompare(entryTimeA);
        })[0];
    }

    function createDueDosesForDate(state, date, context = {}) {
      const key = helpers.toDateKey(date);
      const all = [];
      const meds = context.medsForActiveProfile || (() => medsForActiveProfile(state));
      const save = context.saveState || (() => saveState(state));
      const doseHistoryDays = Number(context.doseHistoryDays ?? 14);

      meds().forEach((med) => {
        if (med.status === "stopped") {
          return;
        }
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

      state.doses = state.doses.filter((entry) => entry.dateKey >= helpers.toDateKey(new Date(Date.now() - 1000 * 60 * 60 * 24 * doseHistoryDays)));
      save();
      return all.sort((a, b) => a.time.localeCompare(b.time));
    }

    const logPrnDose = function(state, med, context = {}) {
      const rawMinutesAgo = Number(context.minutesAgo);
      const minutesAgo = Number.isFinite(rawMinutesAgo) && rawMinutesAgo > 0 ? rawMinutesAgo : 0;
      const loggedAtValue = context.loggedAt ? new Date(context.loggedAt) : new Date();
      const timestampValue = context.timestamp ? new Date(context.timestamp) : new Date(Date.now() - minutesAgo * 60 * 1000);
      const takenAt = Number.isNaN(timestampValue.getTime()) ? new Date() : timestampValue;
      const loggedAt = Number.isNaN(loggedAtValue.getTime()) ? new Date() : loggedAtValue;
      const dateKey = helpers.toDateKey(takenAt);
      const time = takenAt.toTimeString().slice(0, 5);
      const id = `${med.id}|${dateKey}|prn-${takenAt.getTime()}`;
      const takenAtIso = takenAt.toISOString();
      const loggedAtIso = loggedAt.toISOString();
      const dose = { id, profileId: state.activeProfileId, medId: med.id, dateKey, time, status: 'taken', snoozedUntil: null, timestamp: takenAtIso, loggedAt: loggedAtIso };
      state.doses.push(dose);
      med.stock = Math.max(0, Number(med.stock) - getDoseQuantityForTime(med, time));
      saveState(state);
      return dose;
    };

    const overduePendingDoses = function(state) {
      const todayKey = helpers.toDateKey(new Date());
      return state.doses.filter((dose) => dose.profileId === state.activeProfileId && dose.status === 'pending' && dose.dateKey < todayKey && findMed(state, dose.medId)?.status !== "stopped");
    };

    const backfillRecentDoseHistory = function(state, days = 14, context = {}) {
      const totalDays = Number(days);
      for (let i = 1; i <= totalDays; i += 1) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        createDueDosesForDate(state, date, {
          medsForActiveProfile: context.medsForActiveProfile,
          saveState: context.saveState,
          doseHistoryDays: context.doseHistoryDays ?? totalDays
        });
      }
    };

    const catchUpOverdueDoses = function(state, context = {}) {
      const overdue = overduePendingDoses(state);
      if (overdue.length === 0) return 0;
      overdue.forEach((dose) => {
        const med = findMed(state, dose.medId);
        if (med) med.stock = Math.max(0, Number(med.stock) - getDoseQuantityForTime(med, dose.time));
        dose.status = 'taken';
        dose.timestamp = new Date().toISOString();
        dose.snoozedUntil = null;
      });
      saveState(state);
      return overdue.length;
    };

    const snoozeDose = function(dose) { dose.status = 'pending'; dose.snoozedUntil = new Date(Date.now() + 10*60*1000).toISOString(); return dose; };

    const untakeDose = function(state, dose) {
      const med = findMed(state, dose.medId);
      if (dose.status === 'taken' && med) med.stock = Number(med.stock) + getDoseQuantityForTime(med, dose.time);
      dose.status = 'pending';
      dose.timestamp = null;
      dose.snoozedUntil = null;
      return dose;
    };

    const isMorningDose = function(dose) { const hour = Number(String(dose.time || "").split(":")[0]); if (!Number.isFinite(hour)) return true; return hour < 12; };

    function markAllByPeriodTaken(state, period, context = {}) {
      const today = createDueDosesForDate(state, new Date(), context);
      const target = today.filter((dose) => {
        if (dose.status === "taken") {
          return false;
        }
        return period === "morning" ? isMorningDose(dose) : !isMorningDose(dose);
      });

      if (target.length === 0) {
        return 0;
      }

      target.forEach((dose) => {
        const med = findMed(state, dose.medId);
        if (med) {
          med.stock = Math.max(0, Number(med.stock) - getDoseQuantityForTime(med, dose.time));
        }
        dose.status = "taken";
        dose.timestamp = new Date().toISOString();
        dose.snoozedUntil = null;
      });

      saveState(state);
      return target.length;
    }

    const repeatsCount = function(med) {
      const value = Number(med.repeats ?? 0);
      if (!Number.isFinite(value) || value < 0) return 0;
      return Math.floor(value);
    };

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

    function emergencyDoseAbbrev(med) {
      if (med.frequency === "asRequired") {
        return "";
      }

      const times = Array.isArray(med.times) ? med.times : [];
      const fallback = Number(med.pillsPerDose) || 1;
      const scheduledTotal = times.reduce((sum, time) => sum + getDoseQuantityForTime(med, time), 0);
      const base = scheduledTotal > 0 ? scheduledTotal : fallback;
      if (base <= 0) {
        return "";
      }

      const qty = Number.isInteger(base) ? String(base) : String(Number(base.toFixed(2)));

      if (med.frequency === "everyOtherDay") {
        return ` (${qty} every 2d)`;
      }
      if (med.frequency === "weekly") {
        const days = friendlyWeeklyDays(med.weeklyDays);
        return days ? ` (${qty} ${days})` : ` (${qty} weekly)`;
      }
      return ` (${qty}/day)`;
    }

    function buildRefillAlertMessages(meds, thresholds = [7, 3, 1]) {
      const messages = [];
      meds.forEach((med) => {
        const left = daysLeft(med);
        thresholds.forEach((threshold) => {
          if (left <= threshold && left > threshold - 0.5) {
            messages.push(`${med.name}: about ${Math.max(0, left).toFixed(1)} day(s) left`);
          }
        });
      });
      return messages;
    }

    const buildMedicalCardText = function(profile, meds) {
      const hasAsRequired = meds.some((med) => med.frequency === "asRequired");
      const medsLabel = meds
        .map((med) => `${med.frequency === "asRequired" ? "*" : ""}${med.name} ${med.strength}${emergencyDoseAbbrev(med)}`)
        .join(", ") || "None";
      const asRequiredNote = hasAsRequired ? " [* as needed]" : "";
      return `${profile.name} | Blood: ${profile.bloodGroup || "Unknown"} | Conditions: ${profile.conditions || "None"} | Allergies: ${profile.allergies || "None"} | Current meds: ${medsLabel}${asRequiredNote}`;
    };

    function caregiverStatusMessage(profileName, todayDoses) {
      const taken = todayDoses.filter((dose) => dose.status === "taken").length;
      return `${profileName}: ${taken}/${todayDoses.length} doses taken today.`;
    }

    function medicationListFilename(profileName, dateKey) {
      const safeName = profileName ? String(profileName).replace(/\s+/g, "-").toLowerCase() + "-" : "";
      return `medication-list-${safeName}${dateKey}.txt`;
    }

    const buildMedicationListText = function(profile, meds, procedures, dateLabel) {
      const repeatsCountFn = repeatsCount;
      const formatDosePlanFn = formatDosePlan;
      const procedureSortKeyFn = procedureSortKey;
      const friendlyWeeklyDaysFn = friendlyWeeklyDays;
      const formatDosePlanWrapper = (med) => formatDosePlanFn(med);
      const sortedMeds = meds
        .map((med) => ({ med, left: daysLeft(med) }))
        .sort((a, b) => {
          const stoppedA = a.med.status === "stopped";
          const stoppedB = b.med.status === "stopped";
          if (stoppedA !== stoppedB) {
            return stoppedA ? 1 : -1;
          }
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

      const FOOD_LABELS = { none: "No special requirement", before: "Take before food", with: "Take with food", after: "Take after food" };
      const FREQ_LABELS = { daily: "Every day", twiceDaily: "Twice daily", everyOtherDay: "Every other day", asRequired: "As required" };

      const lines = [];
      lines.push("MEDICATION LIST");
      lines.push("==".repeat(30));
      lines.push(`Name       : ${profile.name || "Not set"}`);
      lines.push(`Date       : ${dateLabel}`);
      if (profile.bloodGroup) lines.push(`Blood group: ${profile.bloodGroup}`);
      if (profile.conditions) lines.push(`Conditions : ${profile.conditions}`);
      if (profile.allergies) lines.push(`Allergies  : ${profile.allergies}`);
      if (profile.doctorPhone) lines.push(`Doctor     : ${profile.doctorPhone}`);
      if (profile.pharmacyPhone) lines.push(`Pharmacy   : ${profile.pharmacyPhone}`);
      lines.push("");
      lines.push(`MEDICATIONS (${sortedMeds.length})`);
      lines.push("--".repeat(30));

      if (sortedMeds.length === 0) {
        lines.push("No medications recorded.");
      } else {
        sortedMeds.forEach((med, i) => {
          lines.push("");
          lines.push(`${i + 1}. ${med.name}${med.strength ? "  " + med.strength : ""}${med.status === "stopped" ? "  [Stopped]" : ""}`);
          if (med.purpose) lines.push(`   Purpose  : ${med.purpose}`);
          const times = Array.isArray(med.times) && med.times.length > 0
            ? med.times.map((time) => formatTimeWithLabel(time, profile.timingPresets)).join(", ")
            : "Not set";
          const freqExport = med.frequency === "weekly"
            ? `Weekly — ${friendlyWeeklyDays(med.weeklyDays) || "day not specified"}`
            : (FREQ_LABELS[med.frequency] || "Daily");
          lines.push(`   Schedule : ${freqExport}  -  ${times}`);
          lines.push(`   Dose plan: ${formatDosePlan(med, profile.timingPresets)}`);
          if (med.frequency === "asRequired") {
            lines.push(`   PRN gap  : ${prnMinGapHours(med)} hour(s)`);
          }
          lines.push(`   Repeats  : ${repeatsCount(med)}`);
          lines.push(`   Food     : ${FOOD_LABELS[med.foodRule] || med.foodRule || "No special requirement"}`);
          if (med.status === "stopped") {
            lines.push("   Status   : Stopped");
          }
          if (med.notes) lines.push(`   Notes    : ${med.notes}`);
        });
      }

      const sortedProcedures = procedures
        .slice()
        .sort((a, b) => procedureSortKey(b.date || "").localeCompare(procedureSortKey(a.date || "")));

      lines.push("");
      lines.push(`PROCEDURES (${sortedProcedures.length})`);
      lines.push("--".repeat(30));
      if (sortedProcedures.length === 0) {
        lines.push("No procedures recorded.");
      } else {
        sortedProcedures.forEach((procedure, i) => {
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
      return lines.join("\n");
    }

    function amPmSummaryFilename(profileName, dateKey) {
      const safeName = profileName ? String(profileName).replace(/\s+/g, "-").toLowerCase() + "-" : "";
      return `medication-summary-am-pm-${safeName}${dateKey}.txt`;
    }

    const buildAmPmSummaryText = function(profile, meds, generatedLabel) {
      const sortedMeds = meds
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

      sortedMeds.forEach((med) => {
        const times = Array.isArray(med.times) ? med.times : [];
        const medLabel = `${med.name}${med.strength ? ` (${med.strength})` : ""}${med.status === "stopped" ? " [Stopped]" : ""}`;
        if (times.length === 0) {
          unsetRows.push(`- ${medLabel} - time not set`);
          return;
        }

        times.forEach((time) => {
          const minutes = toMinutes(time);
          const doseLine = `- ${medLabel} - ${getDoseQuantityForTime(med, time)} ${doseUnit(med)}`;
          const displayTime = formatTimeWithLabel(time, profile.timingPresets);

          if (!timeGroups.has(time)) {
            timeGroups.set(time, { minutes, displayTime, rows: [] });
          }

          timeGroups.get(time).rows.push({ medName: med.name, line: doseLine });
        });
      });

      const lines = [];
      lines.push("Medication Summary (AM/PM)");
      lines.push(`Profile: ${profile.name || "Current user"}`);
      lines.push(`Generated: ${generatedLabel}`);
      lines.push("");

      const sortedTimes = Array.from(timeGroups.entries())
        .sort((a, b) => a[1].minutes - b[1].minutes || a[0].localeCompare(b[0]));

      if (sortedTimes.length === 0 && unsetRows.length === 0) {
        lines.push("- None");
      } else {
        sortedTimes.forEach(([time, group]) => {
          lines.push(group.displayTime || time);
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

      return lines.join("\n");
    };

    function normalizeImportedBackup(parsed, context = {}) {
      const makeId = context.makeId;
      const todayDateKey = context.todayDateKey || new Date().toISOString().slice(0, 10);

      if (!parsed) {
        return null;
      }

      const mapImportedMedications = (items, profileId) => items.map((item) => ({
        id: item.id || makeId(),
        profileId,
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
        startDate: item.startDate || todayDateKey,
        photoDataUrl: item.photoDataUrl || "",
        status: item.status === "stopped" ? "stopped" : "active"
      }));

      if (Array.isArray(parsed)) {
        const fallback = buildDefaultState();
        fallback.medications = mapImportedMedications(parsed, fallback.activeProfileId);
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
        fallback.medications = mapImportedMedications(parsed.medications, fallback.activeProfileId);
        return fallback;
      }

      return null;
    }

    function buildAlarmDisplayMessage(dose, med, timingPresets = []) {
      return `${formatTimeWithLabel(dose.time, timingPresets)} - ${getDoseQuantityForTime(med, dose.time)} ${doseUnit(med)}. ${friendlyFoodRule(med.foodRule)}.`;
    }

    function buildReminderSpeechText(med) {
      const nextDose = (Array.isArray(med.times) && med.times[0]) || "08:00";
      const quantity = getDoseQuantityForTime(med, nextDose);
      return `Time for ${med.name}. Please take ${quantity} ${doseUnit(med)}.`;
    }

    function findPendingDueDose(doses, now) {
      return doses.find((dose) => {
        if (dose.status !== "pending") {
          return false;
        }
        if (dose.snoozedUntil && new Date(dose.snoozedUntil) > now) {
          return false;
        }
        const due = new Date(`${dose.dateKey}T${dose.time}:00`);
        return now >= due;
      }) || null;
    }

    function shouldEscalateAlarmMessage(dose, nowMs, thresholdMinutes = 15) {
      if (!dose) {
        return false;
      }
      const due = new Date(`${dose.dateKey}T${dose.time}:00`);
      return nowMs - due.getTime() > thresholdMinutes * 60 * 1000;
    }

    function forceParamState(search, reloadMarker) {
      const params = new URLSearchParams(search || "");
      return {
        token: params.get("force"),
        reloaded: params.get("reloaded") === reloadMarker
      };
    }

    function forceReloadQuery(search, reloadMarker) {
      const params = new URLSearchParams(search || "");
      params.set("reloaded", reloadMarker);
      return params.toString();
    }

    function shouldRegisterServiceWorker(search, reloadMarker) {
      const forceState = forceParamState(search, reloadMarker);
      if (!forceState.token) {
        return true;
      }
      return forceState.reloaded;
    }

    const buildMedicationCsvRows = function(params) {
      const { visibleMeds, allDoses, fallbackDoses, dateKey, findMedById } = params;
      const rows = ["date,time,medication,status,timestamp"];
      const visibleMedIds = new Set(visibleMeds.map((med) => med.id));
      let dosesForExport = allDoses.filter((dose) => visibleMedIds.has(dose.medId));
      if (dosesForExport.length === 0) dosesForExport = fallbackDoses.filter((dose) => visibleMedIds.has(dose.medId));
      if (dosesForExport.length === 0 && visibleMeds.length > 0) {
        visibleMeds.forEach((med) => {
          rows.push([
            escapeCsvField(dateKey),
            escapeCsvField((med.times && med.times[0]) || ""),
            escapeCsvField(med.name),
            escapeCsvField("planned"),
            escapeCsvField("")
          ].join(","));
        });
      } else {
        dosesForExport.forEach((dose) => {
          const med = findMedById(dose.medId);
          rows.push([
            escapeCsvField(dose.dateKey),
            escapeCsvField(dose.time),
            escapeCsvField(med ? med.name : "Unknown"),
            escapeCsvField(dose.status),
            escapeCsvField(dose.timestamp || "")
          ].join(","));
        });
      }
      return rows;
    };

    const buildProceduresCsvRows = function(procedures) {
      const rows = ["date,procedure_name,doctor_name,notes"];
      const sortedProcedures = procedures.slice().sort((a, b) => procedureSortKey(b.date || "").localeCompare(procedureSortKey(a.date || "")));
      sortedProcedures.forEach((procedure) => {
        const safeDate = JSON.stringify(String(procedure.date || ""));
        const safeName = JSON.stringify(String(procedure.procedureName || ""));
        const safeDoctor = JSON.stringify(String(procedure.doctorName || ""));
        const safeNotes = JSON.stringify(String(procedure.notes || ""));
        rows.push(`${safeDate},${safeName},${safeDoctor},${safeNotes}`);
      });
      return rows;
    };

    function checkSafetyForNewMed(newMed, context = {}, excludeMedId = null) {
      const existing = context.existingMeds || [];
      const duplicate = existing.find(
        (med) => med.id !== excludeMedId && med.name.toLowerCase() === newMed.name.toLowerCase() && med.strength.toLowerCase() === newMed.strength.toLowerCase()
      );
      if (duplicate) {
        return "Duplicate warning: same medicine and strength already added.";
      }

      const activeNames = existing.map((med) => med.name.toLowerCase());
      const candidate = newMed.name.toLowerCase();
      const interactionRules = context.interactionRules || [];
      const pair = interactionRules.find(
        ([a, b]) => (candidate.includes(a) && activeNames.some((item) => item.includes(b))) || (candidate.includes(b) && activeNames.some((item) => item.includes(a)))
      );
      if (pair) {
        return `Interaction alert: ${pair[2]}.`;
      }

      const allergies = String(context.activeProfileAllergies || "").toLowerCase();
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

    function parseWeeklyDays(raw) {
      return String(raw || "")
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
    }

    const isValidDateKey = function(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value); };

    const isValidPartialDate = function(value) { return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(value); };

    const procedureSortKey = function(value) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
      if (/^\d{4}-\d{2}$/.test(value)) return `${value}-00`;
      if (/^\d{4}$/.test(value)) return `${value}-00-00`;
      return "0000-00-00";
    };

    function escapeCsvField(value) {
      const text = String(value ?? "");
      return `"${text.replace(/"/g, '""')}"`;
    }

    function recoverProfileMedicationVisibility(state, context) {
      const { getActiveProfile, saveState } = context;
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

    function profileTimingPresets(profile) {
      return normalizeTimingPresets(profile?.timingPresets, { defaultIfMissing: true });
    }

    function profileTimingLabelForTime(profile, time) {
      return formatTimeWithLabel(time, profileTimingPresets(profile));
    }

    function profileTimingTimeForLabel(profile, value) {
      return resolveScheduledTime(value, profileTimingPresets(profile));
    }

    return {
      buildDefaultState,
      normalizeState,
      loadState,
      saveState,
      getActiveProfile,
      medsForActiveProfile,
      activeMedsForActiveProfile,
      proceduresForActiveProfile,
      parseTimes,
      parseDosePlan,
      parseTimingPresets: normalizeTimingPresets,
      formatTimingPresets,
      normalizeDosePlan,
      hasDosePlan,
      getDoseQuantityForTime,
      doseUnit,
      friendlyFoodRule,
      friendlyForm,
      friendlyFrequency,
      friendlyWeeklyDays,
      formatDosePlan,
      medDisplayLine,
      statusText,
      medicationStatusLabel,
      serializeDosePlan,
      fixMedicationDosePlan,
      pillsNeededPerDay,
      daysLeft,
      doseId,
      minHoursBetweenDoses,
      includesDay,
      findMed,
      lastTakenForMed,
      createDueDosesForDate,
      logPrnDose,
      overduePendingDoses,
      backfillRecentDoseHistory,
      catchUpOverdueDoses,
      snoozeDose,
      untakeDose,
      isMorningDose,
      markAllByPeriodTaken,
      repeatsCount,
      refillFlag,
      emergencyDoseAbbrev,
      buildRefillAlertMessages,
      buildMedicalCardText,
      caregiverStatusMessage,
      medicationListFilename,
      buildMedicationListText,
      amPmSummaryFilename,
      buildAmPmSummaryText,
      normalizeImportedBackup,
      buildAlarmDisplayMessage,
      buildReminderSpeechText,
      profileTimingPresets,
      profileTimingLabelForTime,
      profileTimingTimeForLabel,
      findPendingDueDose,
      shouldEscalateAlarmMessage,
      forceParamState,
      forceReloadQuery,
      shouldRegisterServiceWorker,
      buildMedicationCsvRows,
      buildProceduresCsvRows,
      checkSafetyForNewMed,
      validateProcedureInput,
      parseWeeklyDays,
      isValidDateKey,
      isValidPartialDate,
      procedureSortKey,
      recoverProfileMedicationVisibility
    };
  }

  global.createStateApi = createStateApi;
})(window);

// If running under Node (tests), also export `createStateApi` for require()
try {
  if (typeof module !== 'undefined' && module.exports && typeof globalThis !== 'undefined' && globalThis.createStateApi) {
    module.exports = module.exports || {};
    module.exports.createStateApi = globalThis.createStateApi;
  }
} catch (e) {
  // ignore in browsers
}
