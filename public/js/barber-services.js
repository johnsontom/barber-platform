"use strict";
(() => {
  document.querySelectorAll("[data-service-picker]").forEach(picker => {
    const search = picker.querySelector("[data-service-search]");
    if (!search) return;
    const options = Array.from(picker.querySelectorAll("[data-service-option]"));
    const checkboxes = options.map(option => option.querySelector('input[name="service_ids"]'));
    const count = picker.querySelector("[data-service-selection-count]");
    const empty = picker.querySelector("[data-service-no-match]");
    const select = picker.querySelector("[data-services-select]");
    const clear = picker.querySelector("[data-services-clear]");
    picker.querySelector("[data-service-search-field]").hidden = false;
    picker.querySelector("[data-service-tools]").hidden = false;
    function update() {
      const query = search.value.trim().toLocaleLowerCase("en-GB");
      options.forEach(option => { option.hidden = !option.dataset.serviceName.toLocaleLowerCase("en-GB").includes(query); });
      const visible = options.filter(option => !option.hidden).length;
      const selected = checkboxes.filter(checkbox => checkbox.checked).length;
      count.textContent = `${selected} of ${options.length} services selected${query ? ` · ${visible} shown` : ""}`;
      empty.hidden = visible > 0;
      select.disabled = clear.disabled = visible === 0;
    }
    function selectVisible(checked) {
      options.forEach((option, index) => { if (!option.hidden) checkboxes[index].checked = checked; });
      update();
    }
    search.addEventListener("input", update);
    checkboxes.forEach(checkbox => checkbox.addEventListener("change", update));
    select.addEventListener("click", () => selectVisible(true));
    clear.addEventListener("click", () => selectVisible(false));
    update();
  });
})();
