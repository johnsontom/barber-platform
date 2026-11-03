
document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector(".search-panel");
  const serviceSelect = form?.querySelector('select[name="service"]');
  const locationInput = form?.querySelector('input[name="location"]');
  const chips = document.querySelectorAll(".filter-chip");
  const navigation = performance.getEntriesByType("navigation")[0];

  if (navigation?.type === "reload" && window.location.search) {
    window.location.replace("/");
    return;
  }

  const filterValues = {
    all: "",
    fade: "fade",
    classic: "full-cut",
    beard: "beard"
  };

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      if (!form || !serviceSelect) return;

      const filter = chip.dataset.filter;
      serviceSelect.value = filterValues[filter] ?? "";

      form.requestSubmit();
    });
  });

  // Scroll to the salon listings when the search button is used.
  form?.addEventListener("submit", () => {
    // The browser submits the GET request to the Express homepage route.
  });

  // Reveal cards smoothly as they enter the viewport.
  const revealTargets = document.querySelectorAll(".salon-card, .step-card");

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    revealTargets.forEach((item) => {
      item.style.opacity = "0";
      item.style.transform = "translateY(14px)";
      item.style.transition = "opacity .6s ease, transform .6s ease";
      observer.observe(item);
    });

    const style = document.createElement("style");
    style.textContent =
      ".salon-card.is-visible,.step-card.is-visible{opacity:1!important;transform:translateY(0)!important}";
    document.head.appendChild(style);
  }
});
