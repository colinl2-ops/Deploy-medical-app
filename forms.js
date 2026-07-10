(function (global) {
  function createFormsApi() {
    let medicationSavedTimeoutId = null;

    function flashMedicationSaved(dom) {
      if (!dom.medSavedFlag) {
        return;
      }

      if (medicationSavedTimeoutId) {
        clearTimeout(medicationSavedTimeoutId);
        medicationSavedTimeoutId = null;
      }

      dom.medSavedFlag.textContent = "Medication Saved";
      dom.medSavedFlag.classList.remove("hidden");
      dom.medSavedFlag.classList.add("visible");

      medicationSavedTimeoutId = window.setTimeout(() => {
        if (!dom.medSavedFlag) {
          medicationSavedTimeoutId = null;
          return;
        }

        dom.medSavedFlag.textContent = "";
        dom.medSavedFlag.classList.add("hidden");
        dom.medSavedFlag.classList.remove("visible");
        medicationSavedTimeoutId = null;
      }, 2000);
    }

    function handleProfileSubmit(event, context) {
      const { dom, getActiveProfile, saveState, renderAll } = context;
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
    }

    async function handleMedicationSubmit(event, context) {
      const {
        dom,
        state,
        editingMedicationId,
        fileToDataUrl,
        toDateKey,
        isValidDateKey,
        parseDosePlan,
        parseTimes,
        parseWeeklyDays,
        makeId,
        checkSafetyForNewMed,
        saveState,
        resetMedicationEditMode,
        renderAll
      } = context;

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
      flashMedicationSaved(dom);
      renderAll();
    }

    function handleProcedureSubmit(event, context) {
      const {
        dom,
        state,
        editingProcedureId,
        makeId,
        validateProcedureInput,
        saveState,
        resetProcedureEditMode,
        renderAll
      } = context;

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
    }

    return {
      handleProfileSubmit,
      handleMedicationSubmit,
      handleProcedureSubmit
    };
  }

  global.createFormsApi = createFormsApi;
})(window);
