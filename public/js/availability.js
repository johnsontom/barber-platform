"use strict";
document.querySelectorAll("[data-shift-row]").forEach(row => {
  const select = row.querySelector("[data-working]");
  function update() {
    row.querySelectorAll("[data-shift-time]").forEach(input => {
      input.disabled = select.value === "0";
      input.required = select.value === "1";
    });
  }
  select.addEventListener("change", update);
  update();
});
