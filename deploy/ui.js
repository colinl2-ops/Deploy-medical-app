(function (global) {
  function createUiApi() {
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

    return {
      setupCollapsibleCards
    };
  }

  global.createUiApi = createUiApi;
})(window);
