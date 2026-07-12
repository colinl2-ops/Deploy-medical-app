(function (global) {
  function createRendererApi() {
    function renderProcedures(procedures, context) {
      const {
        dom,
        procedureSortKey,
        setEditingProcedureId,
        state,
        saveState,
        renderAll
      } = context;

      const sortedProcedures = procedures
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
      if (sortedProcedures.length === 0) {
        const empty = document.createElement("p");
        empty.className = "summary";
        empty.textContent = "No procedures recorded for this user yet.";
        dom.procedureList.appendChild(empty);
        return;
      }

      sortedProcedures.forEach((procedure) => {
        const node = dom.procedureTemplate.content.cloneNode(true);
        const summaryParts = [procedure.date, procedure.procedureName, procedure.doctorName].filter(Boolean);
        node.querySelector(".procedure-summary").textContent = summaryParts.join(" • ");

        node.querySelector(".procedure-edit-btn").addEventListener("click", () => {
          setEditingProcedureId(procedure.id);
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

    function renderRunningOut(meds, context) {
      const { dom, daysLeft } = context;
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

    function renderOrderPriority(meds, context) {
      const { dom, daysLeft, getActiveProfile, repeatsCount } = context;
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

    function renderMeds(meds, context) {
      const {
        dom,
        daysLeft,
        formatDosePlan,
        friendlyFoodRule,
        friendlyFrequency,
        friendlyWeeklyDays,
        repeatsCount,
        doseUnit,
        refillFlag,
        friendlyForm,
        setEditingMedicationId,
        serializeDosePlan,
        toDateKey,
        openMedicationFormCard,
        refreshMedicationSubmitState,
        logPrnDose,
        state,
        saveState,
        renderAll
      } = context;

      dom.medList.innerHTML = "";
      const sortedMeds = [...meds].sort((a, b) => {
        return a.name.localeCompare(b.name);
      });

      sortedMeds.forEach((med) => {
        const node = dom.medTemplate.content.cloneNode(true);
        node.querySelector(".med-photo").src = med.photoDataUrl || "icons/icon-192.svg";
        node.querySelector(".med-name").textContent = `${med.name} ${med.strength}`;
        node.querySelector(".med-purpose").textContent = `For: ${med.purpose}`;

        const timesText = med.frequency === "asRequired"
          ? "As required (no schedule)"
          : `Times: ${Array.isArray(med.times) && med.times.length > 0 ? med.times.join(", ") : "Not set"}`;
        node.querySelector(".med-times").textContent = timesText;

        node.querySelector(".med-dose-plan").textContent = `Dose plan: ${formatDosePlan(med)}`;

        const freqLabel = med.frequency === "weekly" && Array.isArray(med.weeklyDays) && med.weeklyDays.length > 0
          ? `Weekly — ${friendlyWeeklyDays(med.weeklyDays)}`
          : friendlyFrequency(med.frequency);
        node.querySelector(".med-schedule").textContent = `${friendlyFoodRule(med.foodRule)} | ${freqLabel} | Repeats: ${repeatsCount(med)}`;

        const dl = daysLeft(med);
        const daysText = Number.isFinite(dl) ? `${dl.toFixed(1)} day(s) left` : `Stock: ${med.stock} ${doseUnit(med)}`;
        node.querySelector(".med-days").textContent = `${daysText}. ${refillFlag(med)}.`;
        node.querySelector(".med-notes").textContent = med.notes || "No notes";
        node.querySelector(".food-chip").textContent = friendlyFoodRule(med.foodRule);
        node.querySelector(".freq-chip").textContent = friendlyFrequency(med.frequency);
        node.querySelector(".form-chip").textContent = friendlyForm(med.form || "tablet");

        node.querySelector(".edit-btn").addEventListener("click", () => {
          setEditingMedicationId(med.id);
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
          dom.medForm.frequency.dispatchEvent(new Event("change", { bubbles: true }));
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
          if (typeof refreshMedicationSubmitState === "function") {
            refreshMedicationSubmitState();
          }
          dom.safetyMessage.textContent = `Editing ${med.name}. Update fields and click Save Changes.`;
          const jumpTarget = openMedicationFormCard();
          setTimeout(() => {
            const target = jumpTarget || document.getElementById("medFormTarget") || dom.medForm.closest("section.card") || dom.medForm;
            const targetTop = target.getBoundingClientRect().top + window.pageYOffset;
            const scrollTop = Math.max(0, targetTop - 12);
            if (target.id) {
              window.location.hash = target.id;
            }
            target.focus?.({ preventScroll: true });
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
          const confirmed = window.confirm(`Delete ${med.name}${med.strength ? " " + med.strength : ""}?\n\nThis will remove the medication and all its dose history. This cannot be undone.`);
          if (!confirmed) {
            return;
          }
          state.medications = state.medications.filter((entry) => entry.id !== med.id);
          state.doses = state.doses.filter((entry) => entry.medId !== med.id);
          saveState();
          renderAll();
        });

        dom.medList.appendChild(node);
      });
    }

    function renderTimeline(todayDoses, meds, context) {
      const {
        dom,
        getDoseQuantityForTime,
        doseUnit,
        friendlyFoodRule,
        statusText,
        markDose,
        untakeDose,
        snoozeDose
      } = context;

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

    function renderAdherence(todayDoses, context) {
      const { dom, toDateKey, state, overduePendingDoses } = context;
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

    function renderAll(context) {
      const {
        recoverProfileMedicationVisibility,
        state,
        enablePopupReminders,
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
      } = context;

      recoverProfileMedicationVisibility();
      document.body.classList.toggle("high-contrast", Boolean(state.settings.highContrast));

      if (!enablePopupReminders) {
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

    return {
      renderProcedures,
      renderRunningOut,
      renderOrderPriority,
      renderMeds,
      renderTimeline,
      renderAdherence,
      renderAll
    };
  }

  global.createRendererApi = createRendererApi;
})(window);
