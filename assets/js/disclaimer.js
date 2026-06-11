const DISCLAIMER_SESSION_KEY = "seaweedTidePlannerMarineDisclaimerAccepted";

const DISCLAIMER_TITLE = "Marine navigation and field-safety disclaimer";

const DISCLAIMER_BODY = `
  <p><strong>This Tide Planner is not a marine navigation system, official tide table, safety-of-life service, or emergency decision tool.</strong> It is provided only as general seaweed-farming planning guidance.</p>
  <p>Do not use this app as the sole basis for navigation, vessel operation, port entry or departure, anchoring, mooring, route planning, swimming, diving, fishing, crossing channels, crossing reef flats, transporting people or goods, emergency response, or deciding whether conditions are safe.</p>
  <p>Tide times and heights can be affected by source-data errors, unverified datasets, datum differences, timezone conversion, interpolation, weather, wind setup, atmospheric pressure, river flow, swell, currents, coastal shape, reef and lagoon effects, local obstructions, equipment error, user settings, offline/cache age, and changes made after a dataset was imported.</p>
  <p>Before acting, check current local conditions and official or locally approved sources such as harbour authorities, national hydrographic or meteorological services, notices to mariners, tide gauges, trained local observers, and site supervisors. When in doubt, do not go out.</p>
  <p>The operators, developers, data processors, project partners, and local administrators cannot guarantee that the displayed tide information is accurate, complete, current, suitable for your location, or safe for any specific activity. You remain responsible for your own decisions and for following local rules, warnings, and instructions.</p>
`;

document.addEventListener("DOMContentLoaded", () => {
  ensureDisclaimerModal();
  bindFooterDisclaimerLinks();

  if (!hasAcceptedThisSession()) {
    openDisclaimer({ requireAcknowledgement: true });
  }
});

function ensureDisclaimerModal() {
  if (document.getElementById("marineDisclaimerModal")) return;

  const modal = document.createElement("section");
  modal.id = "marineDisclaimerModal";
  modal.className = "marine-disclaimer-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "marineDisclaimerTitle");
  modal.setAttribute("hidden", "");
  modal.innerHTML = `
    <div class="marine-disclaimer-panel" role="document">
      <p class="eyebrow">Safety notice</p>
      <h2 id="marineDisclaimerTitle">${DISCLAIMER_TITLE}</h2>
      <div class="marine-disclaimer-copy">
        ${DISCLAIMER_BODY}
      </div>
      <div class="marine-disclaimer-actions">
        <button type="button" id="marineDisclaimerAccept">I understand - continue</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector("#marineDisclaimerAccept").addEventListener("click", acknowledgeDisclaimer);
}

function bindFooterDisclaimerLinks() {
  document.querySelectorAll("[data-disclaimer-open]").forEach((button) => {
    button.addEventListener("click", () => openDisclaimer({ requireAcknowledgement: false }));
  });
}

function openDisclaimer() {
  const modal = document.getElementById("marineDisclaimerModal");
  const button = document.getElementById("marineDisclaimerAccept");
  if (!modal || !button) return;

  modal.hidden = false;
  document.body.classList.add("disclaimer-open");
  window.setTimeout(() => button.focus(), 0);
}

function acknowledgeDisclaimer() {
  try {
    window.sessionStorage.setItem(DISCLAIMER_SESSION_KEY, "true");
  } catch (error) {
    // If storage is unavailable, continue after the user has explicitly acknowledged this view.
  }

  const modal = document.getElementById("marineDisclaimerModal");
  if (modal) modal.hidden = true;
  document.body.classList.remove("disclaimer-open");
}

function hasAcceptedThisSession() {
  try {
    return window.sessionStorage.getItem(DISCLAIMER_SESSION_KEY) === "true";
  } catch (error) {
    return false;
  }
}
