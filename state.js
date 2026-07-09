(function (global) {
  function createStateApi(config) {
    const keys = config.keys;
    const helpers = config.helpers;

    function buildDefaultState() {
      const first = helpers.defaultProfile();
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
      const legacy = helpers.parseJSON(localStorage.getItem(keys.LEGACY_MED_LIST_KEY) || "null");
      if (!Array.isArray(legacy) || legacy.length === 0) {
        return [];
      }

      return legacy.map((item) => ({
        id: item.id || helpers.makeId(),
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
        startDate: helpers.toDateKey(new Date()),
        photoDataUrl: ""
      }));
    }

    function recoverMedsBackup(activeProfileId) {
      const backup = helpers.parseJSON(localStorage.getItem(keys.MEDS_BACKUP_KEY) || "null");
      if (!Array.isArray(backup) || backup.length === 0) {
        return [];
      }

      return backup
        .filter((item) => item && typeof item === "object" && item.name)
        .map((item) => ({
          id: item.id || helpers.makeId(),
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
          startDate: item.startDate || helpers.toDateKey(new Date()),
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
      const primary = normalizeState(helpers.parseJSON(localStorage.getItem(keys.STORAGE_KEY) || "null"));
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
                helpers.parseJSON(localStorage.getItem(keys.RECOVERY_SNAPSHOT_KEY) || "null"),
                primary.activeProfileId
              );
              if (snapshotMeds.length > 0) {
                primary.medications = snapshotMeds;
              }
            }
          }
        }
        primary.medications = primary.medications.map((med) => helpers.fixMedicationDosePlan(med));
        return primary;
      }

      const backup = normalizeState(helpers.parseJSON(localStorage.getItem(keys.BACKUP_STORAGE_KEY) || "null"));
      if (backup) {
        if (backup.medications.length === 0) {
          const snapshotMeds = recoverMedsFromStateSnapshot(
            helpers.parseJSON(localStorage.getItem(keys.RECOVERY_SNAPSHOT_KEY) || "null"),
            backup.activeProfileId
          );
          if (snapshotMeds.length > 0) {
            backup.medications = snapshotMeds;
          }
        }
        backup.medications = backup.medications.map((med) => helpers.fixMedicationDosePlan(med));
        return backup;
      }

      const fallback = buildDefaultState();
      const medsBackup = recoverMedsBackup(fallback.activeProfileId);
      if (medsBackup.length > 0) {
        fallback.medications = medsBackup;
        fallback.medications = fallback.medications.map((med) => helpers.fixMedicationDosePlan(med));
        return fallback;
      }

      const snapshotMeds = recoverMedsFromStateSnapshot(
        helpers.parseJSON(localStorage.getItem(keys.RECOVERY_SNAPSHOT_KEY) || "null"),
        fallback.activeProfileId
      );
      if (snapshotMeds.length > 0) {
        fallback.medications = snapshotMeds;
        fallback.medications = fallback.medications.map((med) => helpers.fixMedicationDosePlan(med));
        return fallback;
      }

      const recovered = recoverLegacyMedications(fallback.activeProfileId);
      if (recovered.length > 0) {
        fallback.medications = recovered;
        fallback.medications = fallback.medications.map((med) => helpers.fixMedicationDosePlan(med));
      }
      return fallback;
    }

    function saveState(state) {
      const serialized = JSON.stringify(state);
      const nextMeds = Array.isArray(state.medications) ? state.medications : [];

      localStorage.setItem(keys.STORAGE_KEY, serialized);
      localStorage.setItem(keys.BACKUP_STORAGE_KEY, serialized);

      if (nextMeds.length > 0) {
        localStorage.setItem(keys.MEDS_BACKUP_KEY, JSON.stringify(nextMeds));
        localStorage.setItem(keys.RECOVERY_SNAPSHOT_KEY, serialized);
        return;
      }

      const existingMedsBackup = helpers.parseJSON(localStorage.getItem(keys.MEDS_BACKUP_KEY) || "null");
      if (!Array.isArray(existingMedsBackup)) {
        localStorage.setItem(keys.MEDS_BACKUP_KEY, JSON.stringify([]));
      }
    }

    function getActiveProfile(state) {
      return state.profiles.find((profile) => profile.id === state.activeProfileId) || state.profiles[0];
    }

    function medsForActiveProfile(state) {
      return state.medications.filter((med) => med.profileId === state.activeProfileId);
    }

    function proceduresForActiveProfile(state) {
      return state.procedures.filter((procedure) => procedure.profileId === state.activeProfileId);
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

    return {
      buildDefaultState,
      normalizeState,
      loadState,
      saveState,
      getActiveProfile,
      medsForActiveProfile,
      proceduresForActiveProfile,
      parseTimes,
      parseDosePlan,
      normalizeDosePlan,
      parseWeeklyDays,
      isValidDateKey,
      isValidPartialDate,
      procedureSortKey,
      recoverProfileMedicationVisibility
    };
  }

  global.createStateApi = createStateApi;
})(window);
