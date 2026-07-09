(function (global) {
  function createRendererApi() {
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
        repeatsCount,
        doseUnit,
        refillFlag,
        friendlyForm,
        setEditingMedicationId,
        serializeDosePlan,
        toDateKey,
        openMedicationFormCard,
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

        node.querySelector(".med-schedule").textContent = `${friendlyFoodRule(med.foodRule)} | ${friendlyFrequency(med.frequency)} | Repeats: ${repeatsCount(med)}`;

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
          state.medications = state.medications.filter((entry) => entry.id !== med.id);
          state.doses = state.doses.filter((entry) => entry.medId !== med.id);
          saveState();
          renderAll();
        });

        dom.medList.appendChild(node);
      });
    }

    return {
      renderRunningOut,
      renderOrderPriority,
      renderMeds
    };
  }

  global.createRendererApi = createRendererApi;
})(window);
