"use strict";
(() => {
  const filter = document.getElementById("booking-filter");
  const service = document.getElementById("booking-service");
  const barber = document.getElementById("booking-barber");
  const data = document.getElementById("booking-barber-options");
  if (!filter || !service || !barber || !data) return;
  const team = JSON.parse(data.textContent);
  const staffTitle = barber.dataset?.staffTitle || "barber";
  const help = document.getElementById("barber-choice-help");
  const showTimes = document.getElementById("show-booking-times");
  const changed = document.getElementById("booking-selection-changed");
  function updateBarbers() {
    const previous = barber.value;
    const eligible = team.filter(person => (person.serviceIds || []).map(String).includes(service.value));
    barber.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = service.value ? `Select a ${staffTitle}` : "Choose a treatment first";
    barber.appendChild(placeholder);
    for (const person of eligible) {
      const option = document.createElement("option");
      option.value = String(person.id);
      option.textContent = person.name + (person.speciality ? ` — ${person.speciality}` : "");
      barber.appendChild(option);
    }
    barber.value = eligible.some(person => String(person.id) === previous) ? previous : eligible.length === 1 ? String(eligible[0].id) : "";
    barber.disabled = !service.value || !eligible.length;
    showTimes.disabled = !service.value || !eligible.length;
    help.textContent = !service.value ? "Choose a treatment to see the team members who offer it."
      : eligible.length ? "Only team members who offer this treatment are shown."
      : "No team members currently offer this treatment. Choose another treatment or contact the salon.";
  }
  service.addEventListener("change", updateBarbers);
  filter.addEventListener("change", () => {
    const slots = document.getElementById("slot-form");
    if (slots) slots.hidden = true;
    if (changed) changed.hidden = false;
  });
  updateBarbers();
})();
(() => {
  const form = document.getElementById("slot-form");
  if (!form) return;
  const submit = document.getElementById("slot-submit");
  const readyLabel = submit.textContent;
  const summary = document.getElementById("slot-summary");
  const radios = Array.from(form.querySelectorAll('input[name="appointment_at"]'));
  const home = form.dataset.home === "true";
  const address = document.getElementById("home-address");
  const quoteId = document.getElementById("home-quote-id");
  const quotePanel = document.getElementById("home-quote");
  const check = document.getElementById("check-home");
  const status = document.getElementById("home-status");
  const useLocation = document.getElementById("use-home-location");
  const locationStatus = document.getElementById("home-location-status");
  const locationHelp = document.getElementById("home-location-help");
  const locationDetails = document.getElementById("home-location-details");
  let revision = 0;
  let locationRevision = 0;
  let expires = null;
  const selected = () => radios.find(radio => radio.checked);

  function pageAllowsLocation() {
    try {
      const policy = document.permissionsPolicy || document.featurePolicy;
      return typeof policy?.allowsFeature === "function" ? policy.allowsFeature("geolocation") : null;
    } catch { return null; }
  }

  async function browserLocationFailure(error) {
    let permission = "unavailable";
    try {
      const result = await navigator.permissions?.query({ name: "geolocation" });
      if (["granted", "denied", "prompt"].includes(result?.state)) permission = result.state;
    } catch { /* Some browsers do not expose the Permissions API. */ }
    const origin = window.location?.origin || "this page";
    const policy = pageAllowsLocation();
    const reason = typeof error?.message === "string" ? error.message.replace(/\s+/g, " ").slice(0, 240) : "No browser reason supplied.";
    let message;
    if (policy === false || /(?:permissions|feature) policy/i.test(reason)) {
      message = "This page is blocked from requesting location. Open the booking page directly in a browser tab, or enter your address manually.";
    } else if (error?.code === 1 && permission === "granted") {
      message = "Your browser reports location permission as allowed, but the location request was still refused. Check device location settings, then fully restart your browser and try again. You can enter your address manually.";
    } else if (error?.code === 1 && permission === "denied") {
      message = `Your browser reports location access as blocked for ${origin}. Check Location for this exact site and your device's location settings, then reload. You can enter your address manually.`;
    } else {
      const messages = {
        1: "Location access was denied by your browser or device. Follow the location settings steps below, then reload this page and try again. You can also enter your address manually.",
        2: "Your location could not be found. Try again, or enter your address manually.",
        3: "Finding your location took too long. Try again, or enter your address manually."
      };
      message = messages[error?.code] || "Your browser could not provide your location. Enter your address manually.";
    }
    const permissionLabel = { granted: "allowed", denied: "blocked", prompt: "ask", unavailable: "unavailable" }[permission];
    const policyLabel = policy === null ? "unavailable" : policy ? "allowed" : "blocked";
    const embedded = window.top && window.top !== window;
    return { message, details: `Page: ${origin}. Location permission: ${permissionLabel}. Page access: ${policyLabel}. Opened in: ${embedded ? "embedded frame" : "browser tab"}. Browser reason: ${reason}` };
  }

  function invalidate() {
    revision++;
    clearTimeout(expires);
    if (home) {
      quoteId.value = "";
      quotePanel.hidden = true;
      status.textContent = "Check your address and selected arrival time to see the full price.";
    }
    submit.disabled = !selected() || (home && !quoteId.value);
    summary.textContent = selected() ? `Selected ${selected().dataset.time}${home ? " arrival at your home" : ""}.` : "Choose a time above to continue.";
  }
  radios.forEach(radio => radio.addEventListener("change", invalidate));
  address?.addEventListener("input", () => {
    locationRevision++;
    if (locationStatus) locationStatus.hidden = true;
    if (locationHelp) locationHelp.hidden = true;
    if (locationDetails) locationDetails.hidden = true;
    invalidate();
  });
  invalidate();

  if (home && useLocation) useLocation.hidden = false;
  useLocation?.addEventListener("click", async () => {
    if (useLocation.disabled) return;
    locationStatus.hidden = false;
    if (locationHelp) locationHelp.hidden = true;
    if (locationDetails) locationDetails.hidden = true;
    if (!navigator.geolocation || !window.isSecureContext) {
      locationStatus.textContent = !window.isSecureContext
        ? "Location is available on HTTPS or localhost. Enter your address manually."
        : "Your browser does not support location. Enter your address manually.";
      return;
    }
    const requestedLocationRevision = ++locationRevision;
    invalidate();
    useLocation.disabled = true;
    useLocation.textContent = "Finding your location...";
    check.disabled = true;
    locationStatus.textContent = "Allow location access in your browser to find your address.";
    let findingPosition = true;
    try {
      if (pageAllowsLocation() === false) {
        throw { code: 1, message: "Geolocation is blocked by this page's permissions policy." };
      }
      const position = await new Promise((resolve, reject) => {
        // Match the working homepage request. Desktop browsers can provide a
        // standard position even when a fresh high-accuracy fix is unavailable.
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
      });
      findingPosition = false;
      if (requestedLocationRevision !== locationRevision) return;
      locationStatus.textContent = "Finding the street address for your location...";
      const data = new FormData(form);
      const response = await fetch("/booking/home-location", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_token: data.get("booking_token"), salon_id: data.get("salon_id"),
          service_id: data.get("service_id"), barber_id: data.get("barber_id"),
          latitude: position.coords.latitude, longitude: position.coords.longitude }),
        signal: AbortSignal.timeout(15000)
      });
      if (response.redirected) throw new Error("Your session has expired. Sign in again to continue.");
      const result = await response.json();
      if (requestedLocationRevision !== locationRevision) return;
      if (!response.ok) throw new Error(result.error || "We could not find your address. Enter it manually.");
      if (typeof result.address !== "string" || result.address.length < 10 || result.address.length > 500) {
        throw new Error("We could not find a full address. Enter your address and postcode manually.");
      }
      address.value = result.address;
      invalidate();
      locationStatus.textContent = "Location found. Check this is your home address and add any flat or house details before checking the price.";
      address.focus({ preventScroll: true });
    } catch (error) {
      if (requestedLocationRevision !== locationRevision) return;
      if (findingPosition) {
        const failure = await browserLocationFailure(error);
        if (requestedLocationRevision !== locationRevision) return;
        locationStatus.textContent = failure.message;
        if (locationDetails) {
          locationDetails.textContent = failure.details;
          locationDetails.hidden = false;
        }
        if (locationHelp) {
          locationHelp.hidden = false;
          locationHelp.open = true;
        }
      } else {
        locationStatus.textContent = error.name === "TimeoutError"
          ? "Finding your address took too long. Try again, or enter your address manually."
          : error.message || "We could not find your address. Enter it manually.";
      }
    } finally {
      useLocation.disabled = false;
      useLocation.textContent = "Use my location";
      check.disabled = false;
    }
  });

  check?.addEventListener("click", async () => {
    if (!selected()) { status.textContent = "Choose an arrival time first."; return; }
    if (!address.reportValidity()) return;
    invalidate();
    const requestedRevision = revision;
    check.disabled = true;
    if (useLocation) useLocation.disabled = true;
    check.textContent = "Checking road journey and diary…";
    status.textContent = "Checking your address, traffic estimates and the full travel block…";
    form.setAttribute("aria-busy", "true");
    try {
      const data = new FormData(form);
      const response = await fetch("/booking/home-quote", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(data)), signal: AbortSignal.timeout(60000)
      });
      if (response.redirected) throw new Error("Your session has expired. Sign in again to continue.");
      const quote = await response.json();
      if (requestedRevision !== revision) return;
      if (!response.ok) throw new Error(quote.error || "Unable to verify this arrival time.");
      const values = { ...quote, servicePrice: `£${quote.servicePrice}`, travelFee: `£${quote.travelFee}`,
        platformFee: `£${quote.platformFee || "0.00"}`, grandTotal: `£${quote.grandTotal || quote.total}`, payNow: `£${quote.payNow || "0.00"}`, salonPayable: `£${quote.salonPayable || quote.total}`,
        total: `£${quote.total}`, outbound: `${quote.outboundMiles} miles · ${quote.outboundMinutes} min`,
        returnJourney: `${quote.returnMiles} miles · ${quote.returnMinutes} min`,
        roundTripMiles: `${quote.roundTripMiles} miles`, serviceMinutes: `${quote.serviceMinutes} min`, setupMinutes: `${quote.setupMinutes} min`,
        reserved: `${quote.reservedFrom} – ${quote.reservedUntil}` };
      document.getElementById("quoted-address").textContent = quote.address;
      quotePanel.querySelectorAll("[data-quote-field]").forEach(field => { field.textContent = values[field.dataset.quoteField]; });
      quoteId.value = quote.quoteId;
      if (quote.feeSignature) document.getElementById("fee-signature").value=quote.feeSignature;
      quotePanel.hidden = false;
      submit.disabled = false;
      status.textContent = "This arrival is available. Review the price and address, then send your request.";
      expires = setTimeout(() => { invalidate(); status.textContent = "This quote has expired. Check the arrival and price again."; }, 10 * 60 * 1000);
    } catch (error) {
      if (requestedRevision === revision) status.textContent = error.name === "TimeoutError" ? "The journey check took too long. Try again." : error.message;
    } finally {
      check.disabled = false;
      if (useLocation) useLocation.disabled = false;
      check.textContent = "Check arrival and price";
      form.removeAttribute("aria-busy");
    }
  });
  form.addEventListener("submit", event => {
    if (home && !quoteId.value) { event.preventDefault(); status.textContent = "Check the arrival and price before submitting."; return; }
    submit.disabled = true;
    submit.textContent = "Sending request…";
  });
  window.addEventListener("pageshow", () => { submit.textContent = readyLabel; invalidate(); });
})();
