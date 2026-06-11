import { APP_CONFIG } from "./config.js";

const TABLES = {
  locations: "farm_locations",
  datasets: "tide_datasets"
};

const AUTH_SESSION_KEY = "seaweed_tide_planner:admin_auth_session";
const NEW_LOCATION_ID = "__new_location__";
const NEW_DATASET_ID = "__new_dataset__";

const DATASET_STATUSES = [
  "imported_unverified",
  "pending_review",
  "verified",
  "superseded",
  "rejected"
];

const state = {
  locations: [],
  datasets: [],
  authSession: null,
  hasLocationDraft: false,
  hasDatasetDraft: false,
  editingLocationId: null,
  editingDatasetId: null
};

const els = {};

document.addEventListener("DOMContentLoaded", init);
window.addEventListener("unhandledrejection", (event) => {
  setConnectionStatus("Load error", "status-muted");
  setStatus(els.locationSaveStatus, event.reason?.message || "Unexpected admin page error.", "error");
});

async function init() {
  cacheElements();
  bindEvents();
  loadStoredAuthSession();
  updateAuthUi();
  await verifyStoredSession();
  await loadAll();
}

function cacheElements() {
  [
    "adminConnectionStatus",
    "adminAuthStatus",
    "adminAuthForm",
    "adminEmail",
    "adminPassword",
    "adminSignIn",
    "adminSignOut",
    "locationCount",
    "datasetCount",
    "locationSaveStatus",
    "datasetSaveStatus",
    "locationsTableBody",
    "datasetsTableBody",
    "reloadLocations",
    "reloadDatasets",
    "newLocation",
    "newDataset"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  els.adminAuthForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await signIn();
  });

  els.adminSignOut.addEventListener("click", async () => {
    await signOut();
  });

  els.reloadLocations.addEventListener("click", () => loadLocations());
  els.reloadDatasets.addEventListener("click", () => loadDatasets());

  els.newLocation.addEventListener("click", () => {
    if (!state.authSession) {
      setStatus(els.locationSaveStatus, "Sign in before adding a location.", "error");
      return;
    }
    state.hasLocationDraft = true;
    state.editingLocationId = NEW_LOCATION_ID;
    renderLocations();
    setStatus(els.locationSaveStatus, "New location row added. Click Create when ready.");
  });

  els.newDataset.addEventListener("click", () => {
    if (!state.authSession) {
      setStatus(els.datasetSaveStatus, "Sign in before adding a dataset.", "error");
      return;
    }
    state.hasDatasetDraft = true;
    state.editingDatasetId = NEW_DATASET_ID;
    renderDatasets();
    setStatus(els.datasetSaveStatus, "New dataset row added. Click Create when ready.");
  });

  els.locationsTableBody.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-location]");
    if (editButton) {
      if (!state.authSession) {
        setStatus(els.locationSaveStatus, "Sign in before editing a location.", "error");
        return;
      }
      state.editingLocationId = editButton.closest("tr").dataset.rowId;
      renderLocations();
      setStatus(els.locationSaveStatus, "Editing row. Click Save to commit changes.");
      return;
    }

    const button = event.target.closest("[data-save-location]");
    if (!button) return;
    await saveLocationRow(button.closest("tr"));
  });

  els.datasetsTableBody.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-dataset]");
    if (editButton) {
      if (!state.authSession) {
        setStatus(els.datasetSaveStatus, "Sign in before editing a dataset.", "error");
        return;
      }
      state.editingDatasetId = editButton.closest("tr").dataset.rowId;
      renderDatasets();
      setStatus(els.datasetSaveStatus, "Editing row. Click Save to commit changes.");
      return;
    }

    const button = event.target.closest("[data-save-dataset]");
    if (!button) return;
    await saveDatasetRow(button.closest("tr"));
  });
}

async function loadAll() {
  setConnectionStatus("Loading", "status-muted");
  try {
    await loadDatasets({ quiet: true });
    await loadLocations({ quiet: true });
    setConnectionStatus(state.authSession ? "Admin connected" : "Public connected", "");
    setSignedOutHints();
  } catch (error) {
    setConnectionStatus("Supabase error", "status-muted");
    setStatus(els.locationSaveStatus, error.message, "error");
    setStatus(els.datasetSaveStatus, error.message, "error");
  }
}

async function loadLocations(options = {}) {
  if (!options.quiet) setStatus(els.locationSaveStatus, "Loading locations...");
  state.locations = await supabaseSelect(TABLES.locations, "select=*&order=farm_name.asc");
  state.hasLocationDraft = false;
  state.editingLocationId = null;
  renderLocations();
  if (!options.quiet) setStatus(els.locationSaveStatus, `Loaded ${state.locations.length} location row(s).`);
}

async function loadDatasets(options = {}) {
  if (!options.quiet) setStatus(els.datasetSaveStatus, "Loading tide datasets...");
  state.datasets = await supabaseSelect(TABLES.datasets, "select=*&order=dataset_key.asc");
  state.hasDatasetDraft = false;
  state.editingDatasetId = null;
  renderDatasets();
  if (!options.quiet) setStatus(els.datasetSaveStatus, `Loaded ${state.datasets.length} dataset row(s).`);
}

function renderLocations() {
  const rows = state.hasLocationDraft ? [defaultLocation(), ...state.locations] : state.locations;
  els.locationCount.textContent = `${rows.length} row${rows.length === 1 ? "" : "s"}`;

  if (!rows.length) {
    els.locationsTableBody.innerHTML = emptyRow(9, "No visible locations returned from Supabase.");
    return;
  }

  els.locationsTableBody.innerHTML = rows.map((row, index) => renderLocationRow(row, index)).join("");
}

function renderLocationRow(row, index) {
  const isNew = !row.id;
  const rowId = isNew ? NEW_LOCATION_ID : row.id;
  const isEditing = rowId === state.editingLocationId;
  const rowClass = [isNew ? "draft-row" : "", isEditing ? "editing-row" : ""].filter(Boolean).join(" ");
  const datasetOptions = [
    ["", "Not linked"],
    ...state.datasets.map((dataset) => [dataset.dataset_key, dataset.dataset_name])
  ];

  if (!isEditing) {
    return `
      <tr data-row-id="${escapeAttribute(rowId)}" data-row-kind="location" class="${rowClass}">
        <td class="id-cell">${locationIdCell(row, index)}</td>
        <td>${readOnlyCell(row.farm_name)}</td>
        <td>${readOnlyCell(row.short_name)}</td>
        <td>${readOnlyCell(formatCoordinate(row.latitude))}</td>
        <td>${readOnlyCell(formatCoordinate(row.longitude))}</td>
        <td>${readOnlyCell(datasetLabel(row.default_tide_dataset_key))}</td>
        <td>${readOnlyCell(formatThreshold(row.default_harvest_threshold_m))}</td>
        <td>${readOnlyCell(recordUseLabel(row, "Shown in app"))}</td>
        <td class="save-cell" data-admin-only>
          <button type="button" data-edit-location ${state.authSession ? "" : "disabled"}>Edit</button>
        </td>
      </tr>
    `;
  }

  return `
    <tr data-row-id="${escapeAttribute(rowId)}" data-row-kind="location" class="${rowClass}">
      <td class="id-cell">${locationIdCell(row, index)}</td>
      <td>${textInput("farm_name", row.farm_name, "name")}</td>
      <td>${textInput("short_name", row.short_name, "short name")}</td>
      <td>${numberInput("latitude", row.latitude, "latitude", "-90", "90", "0.000001")}</td>
      <td>${numberInput("longitude", row.longitude, "longitude", "-180", "180", "0.000001")}</td>
      <td>${selectInput("default_tide_dataset_key", row.default_tide_dataset_key, datasetOptions)}</td>
      <td>${numberInput("default_harvest_threshold_m", row.default_harvest_threshold_m ?? 0.7, "threshold", "0", "5", "0.05")}</td>
      <td>${selectInput("app_use", locationUseValue(row), locationUseOptions())}</td>
      <td class="save-cell" data-admin-only>
        <button type="button" data-save-location ${state.authSession ? "" : "disabled"}>${isNew ? "Create" : "Save"}</button>
      </td>
    </tr>
  `;
}

function renderDatasets() {
  const rows = state.hasDatasetDraft ? [defaultDataset(), ...state.datasets] : state.datasets;
  els.datasetCount.textContent = `${rows.length} row${rows.length === 1 ? "" : "s"}`;

  if (!rows.length) {
    els.datasetsTableBody.innerHTML = emptyRow(10, "No visible tide datasets returned from Supabase.");
    return;
  }

  let displayIndex = 0;
  els.datasetsTableBody.innerHTML = rows.map((row) => renderDatasetRow(row, row.id ? displayIndex++ : -1)).join("");
}

function renderDatasetRow(row, index) {
  const isNew = !row.id;
  const rowId = isNew ? NEW_DATASET_ID : row.id;
  const isEditing = rowId === state.editingDatasetId;
  const rowClass = [isNew ? "draft-row" : "", isEditing ? "editing-row" : ""].filter(Boolean).join(" ");
  const region = datasetRegionValue(row);

  if (!isEditing) {
    return `
      <tr data-row-id="${escapeAttribute(rowId)}" data-row-kind="dataset" class="${rowClass}">
        <td class="id-cell">${datasetIdCell(row, index)}</td>
        <td>${readOnlyCell(row.dataset_name)}</td>
        <td>${readOnlyCell(row.tide_location_name)}</td>
        <td>${readOnlyCell(region)}</td>
        <td>${readOnlyCell(formatCoordinatePair(row.tide_location_latitude, row.tide_location_longitude))}</td>
        <td>${readOnlyCell(formatDateRange(row.valid_from, row.valid_to))}</td>
        <td>${readOnlyCell(row.source_organization || row.source_title)}</td>
        <td>${readOnlyCell(formatStatus(row.verification_status))}</td>
        <td>${readOnlyCell(recordUseLabel(row))}</td>
        <td class="save-cell" data-admin-only>
          <button type="button" data-edit-dataset ${state.authSession ? "" : "disabled"}>Edit</button>
        </td>
      </tr>
    `;
  }

  return `
    <tr data-row-id="${escapeAttribute(rowId)}" data-row-kind="dataset" class="${rowClass}">
      <td class="id-cell">${datasetIdCell(row, index)}</td>
      <td>${textInput("dataset_name", row.dataset_name, "dataset name")}</td>
      <td>${textInput("tide_location_name", row.tide_location_name, "tide location name")}</td>
      <td>${selectInput("tide_location_region", region, tideRegionOptions(region))}</td>
      <td><div class="inline-editor-pair">
        ${numberInput("tide_location_latitude", row.tide_location_latitude, "latitude", "-90", "90", "0.000001")}
        ${numberInput("tide_location_longitude", row.tide_location_longitude, "longitude", "-180", "180", "0.000001")}
      </div></td>
      <td><div class="inline-editor-pair">
        ${dateInput("valid_from", row.valid_from)}
        ${dateInput("valid_to", row.valid_to)}
      </div></td>
      <td>${textInput("source_organization", row.source_organization, "source name")}</td>
      <td>${selectInput("verification_status", row.verification_status || "imported_unverified", DATASET_STATUSES.map((value) => [value, formatStatus(value)]))}</td>
      <td>${selectInput("dataset_use", recordUseValue(row), recordUseOptions())}</td>
      <td class="save-cell" data-admin-only>
        <button type="button" data-save-dataset ${state.authSession ? "" : "disabled"}>${isNew ? "Create" : "Save"}</button>
      </td>
    </tr>
  `;
}

async function saveLocationRow(rowElement) {
  try {
    requireSignedIn();
    const id = rowElement.dataset.rowId === NEW_LOCATION_ID ? null : rowElement.dataset.rowId;
    const current = id ? state.locations.find((row) => row.id === id) || {} : {};
    const appUse = rowValue(rowElement, "app_use");
    const farmName = requiredText(rowValue(rowElement, "farm_name"), "Location name");
    const payload = {
      farm_location_key: current.farm_location_key || normalizeKey(farmName),
      farm_name: farmName,
      short_name: nullableText(rowValue(rowElement, "short_name")),
      latitude: nullableNumber(rowValue(rowElement, "latitude")),
      longitude: nullableNumber(rowValue(rowElement, "longitude")),
      default_tide_dataset_key: nullableText(rowValue(rowElement, "default_tide_dataset_key")),
      default_harvest_threshold_m: nullableNumber(rowValue(rowElement, "default_harvest_threshold_m")) ?? 0.7,
      status: locationStatusForUse(appUse, current.status),
      public_visible: appUse === "public",
      active: appUse !== "inactive",
      country: current.country || "Kenya"
    };

    setStatus(els.locationSaveStatus, "Saving location...");
    const savedRows = id
      ? await supabasePatch(TABLES.locations, id, payload)
      : await supabaseInsert(TABLES.locations, payload);
    state.hasLocationDraft = false;
    await loadLocations({ quiet: true });
    setStatus(els.locationSaveStatus, `${savedRows[0]?.farm_name || payload.farm_name} saved.`);
  } catch (error) {
    setStatus(els.locationSaveStatus, writeErrorMessage(error), "error");
  }
}

async function saveDatasetRow(rowElement) {
  try {
    requireSignedIn();
    const id = rowElement.dataset.rowId === NEW_DATASET_ID ? null : rowElement.dataset.rowId;
    const current = id ? state.datasets.find((row) => row.id === id) || {} : {};
    const datasetName = requiredText(rowValue(rowElement, "dataset_name"), "Dataset name");
    const tideLocationName = requiredText(rowValue(rowElement, "tide_location_name"), "Tide location name");
    const tideLocationRegion = requiredText(rowValue(rowElement, "tide_location_region") || datasetRegionValue(current) || "Kenya", "Location region");
    const datasetUse = rowValue(rowElement, "dataset_use");
    const payload = {
      dataset_key: current.dataset_key || normalizeDatasetKey(datasetName),
      dataset_name: datasetName,
      source_organization: nullableText(rowValue(rowElement, "source_organization")),
      source_file_name: current.source_file_name || null,
      source_url: current.source_url || null,
      tide_location_key: current.tide_location_key || normalizeDatasetKey(tideLocationName),
      tide_location_name: tideLocationName,
      tide_location_country: countryForRegion(tideLocationRegion),
      tide_location_latitude: nullableNumber(rowValue(rowElement, "tide_location_latitude")),
      tide_location_longitude: nullableNumber(rowValue(rowElement, "tide_location_longitude")),
      timezone: current.timezone || "Africa/Nairobi",
      datum_label: current.datum_label || "Metres above lowest astronomical tide",
      prediction_year: current.prediction_year || yearFromDate(rowValue(rowElement, "valid_from")),
      valid_from: requiredText(rowValue(rowElement, "valid_from"), "Valid from"),
      valid_to: requiredText(rowValue(rowElement, "valid_to"), "Valid to"),
      verification_status: rowValue(rowElement, "verification_status") || "imported_unverified",
      has_hourly_predictions: current.has_hourly_predictions === true,
      has_tide_events: current.has_tide_events === true,
      public_visible: datasetUse === "public",
      active: datasetUse !== "inactive"
    };

    if (supportsDatasetRegionField()) {
      payload.tide_location_region = tideLocationRegion;
    }

    setStatus(els.datasetSaveStatus, "Saving dataset...");
    const savedRows = id
      ? await supabasePatch(TABLES.datasets, id, payload)
      : await supabaseInsert(TABLES.datasets, payload);
    state.hasDatasetDraft = false;
    await loadDatasets({ quiet: true });
    await loadLocations({ quiet: true });
    setStatus(els.datasetSaveStatus, `${savedRows[0]?.dataset_name || payload.dataset_name} saved.`);
  } catch (error) {
    setStatus(els.datasetSaveStatus, writeErrorMessage(error), "error");
  }
}

async function supabaseSelect(table, query) {
  return supabaseRequest(`${table}?${query}`);
}

async function supabaseInsert(table, payload) {
  return supabaseRequest(table, {
    method: "POST",
    body: payload,
    prefer: "return=representation",
    requireAuth: true
  });
}

async function supabasePatch(table, id, payload) {
  return supabaseRequest(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: payload,
    prefer: "return=representation",
    requireAuth: true
  });
}

async function supabaseRequest(path, options = {}) {
  if (options.requireAuth) requireSignedIn();

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 18000);
  const token = state.authSession?.access_token || APP_CONFIG.supabase.anonKey;
  const headers = {
    apikey: APP_CONFIG.supabase.anonKey,
    Authorization: `Bearer ${token}`
  };

  if (options.body) headers["Content-Type"] = "application/json";
  if (options.prefer) headers.Prefer = options.prefer;

  try {
    const response = await fetch(`${APP_CONFIG.supabase.restUrl}/${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}${await responseDetail(response)}`);
    }

    if (response.status === 204) return [];
    return response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Supabase request timed out. Reload the page or check the connection.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function signIn() {
  const email = requiredText(els.adminEmail.value, "Email");
  const password = requiredText(els.adminPassword.value, "Password");

  try {
    setAuthStatus("Signing in...");
    const response = await fetch(`${APP_CONFIG.supabase.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: APP_CONFIG.supabase.anonKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      throw new Error(await authErrorMessage(response));
    }

    const session = await response.json();
    state.authSession = normalizeSession(session);
    writeStoredAuthSession(state.authSession);
    els.adminPassword.value = "";
    updateAuthUi();
    await loadAll();
  } catch (error) {
    clearStoredAuthSession();
    state.authSession = null;
    updateAuthUi();
    setAuthStatus(error.message, "error");
  }
}

async function signOut() {
  const token = state.authSession?.access_token;
  clearStoredAuthSession();
  state.authSession = null;
  updateAuthUi();

  if (token) {
    try {
      await fetch(`${APP_CONFIG.supabase.url}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: APP_CONFIG.supabase.anonKey,
          Authorization: `Bearer ${token}`
        }
      });
    } catch {
      // Local sign-out still succeeds if the network request fails.
    }
  }

  await loadAll();
}

async function verifyStoredSession() {
  if (!state.authSession?.access_token) return;

  try {
    const response = await fetch(`${APP_CONFIG.supabase.url}/auth/v1/user`, {
      headers: {
        apikey: APP_CONFIG.supabase.anonKey,
        Authorization: `Bearer ${state.authSession.access_token}`
      }
    });

    if (!response.ok) throw new Error("Stored admin session has expired.");

    const user = await response.json();
    state.authSession.user = user;
    writeStoredAuthSession(state.authSession);
    updateAuthUi();
  } catch {
    clearStoredAuthSession();
    state.authSession = null;
    updateAuthUi();
  }
}

function normalizeSession(session) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at || (session.expires_in ? Math.floor(Date.now() / 1000) + session.expires_in : null),
    user: session.user || null
  };
}

function loadStoredAuthSession() {
  try {
    const raw = window.sessionStorage.getItem(AUTH_SESSION_KEY);
    state.authSession = raw ? JSON.parse(raw) : null;
  } catch {
    state.authSession = null;
  }
}

function writeStoredAuthSession(session) {
  try {
    window.sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  } catch {
    // In-memory session still works if storage is blocked.
  }
}

function clearStoredAuthSession() {
  try {
    window.sessionStorage.removeItem(AUTH_SESSION_KEY);
  } catch {
    // Ignore restricted storage.
  }
}

function updateAuthUi() {
  const signedIn = !!state.authSession?.access_token;
  const email = state.authSession?.user?.email || "signed-in admin";

  document.body.classList.toggle("admin-signed-in", signedIn);
  els.adminSignIn.disabled = signedIn;
  els.adminSignOut.disabled = !signedIn;
  els.newLocation.hidden = !signedIn;
  els.newDataset.hidden = !signedIn;

  if (!signedIn) {
    state.hasLocationDraft = false;
    state.hasDatasetDraft = false;
    state.editingLocationId = null;
    state.editingDatasetId = null;
  }

  document.querySelectorAll("[data-edit-location], [data-save-location], [data-edit-dataset], [data-save-dataset]").forEach((button) => {
    button.disabled = !signedIn;
  });

  if (signedIn) {
    setAuthStatus(`Signed in as ${email}. Hidden/internal rows are available if your policy allows them.`);
    return;
  }

  setAuthStatus("Sign in with an approved Supabase Auth user to save changes.");
}

function setSignedOutHints() {
  if (state.authSession) return;

  setStatus(
    els.datasetSaveStatus,
    "Showing public datasets. Sign in to see hidden/internal reference datasets such as KPA where permission is pending."
  );
}

function requireSignedIn() {
  if (!state.authSession?.access_token) {
    throw new Error("Sign in as an approved admin user before saving.");
  }
}

function defaultLocation() {
  return {
    farm_location_key: "",
    farm_name: "",
    short_name: "",
    country: "Kenya",
    default_harvest_threshold_m: 0.7,
    status: "prototype_placeholder",
    active: true,
    public_visible: true
  };
}

function defaultDataset() {
  const year = new Date().getFullYear();
  return {
    dataset_key: "",
    dataset_name: "",
    tide_location_key: "",
    tide_location_name: "",
    tide_location_region: "Kenya",
    tide_location_country: "Kenya",
    timezone: "Africa/Nairobi",
    prediction_year: year,
    valid_from: `${year}-01-01`,
    valid_to: `${year}-12-31`,
    verification_status: "imported_unverified",
    has_hourly_predictions: false,
    has_tide_events: false,
    active: true,
    public_visible: false
  };
}

function emptyRow(colspan, message) {
  return `<tr><td colspan="${colspan}" class="empty-state">${escapeHtml(message)}</td></tr>`;
}

function readOnlyCell(value) {
  const text = valueOrEmpty(value).trim();
  return text ? `<span class="readonly-value">${escapeHtml(text)}</span>` : `<span class="readonly-muted">-</span>`;
}

function readOnlyStack(values) {
  const lines = values
    .map((value) => valueOrEmpty(value).trim())
    .filter(Boolean);

  if (!lines.length) return readOnlyCell("");
  return `<div class="readonly-stack">${lines.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}</div>`;
}

function datasetLabel(datasetKey) {
  const dataset = state.datasets.find((item) => item.dataset_key === datasetKey);
  return dataset?.dataset_name || datasetKey || "";
}

function formatThreshold(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)} m` : "";
}

function formatCoordinate(value) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(6) : "";
}

function formatCoordinatePair(latitude, longitude) {
  const lat = formatCoordinate(latitude);
  const lon = formatCoordinate(longitude);
  return lat && lon ? `${lat}, ${lon}` : "";
}

function formatDateRange(start, end) {
  if (start && end) return `${start} to ${end}`;
  return start || end || "";
}

function datasetDataFlags(row) {
  const flags = [];
  if (row.has_hourly_predictions) flags.push("Hourly");
  if (row.has_tide_events) flags.push("Events");
  return flags;
}

function recordUseLabel(row, publicLabel = "Public") {
  const value = recordUseValue(row);
  if (value === "inactive") return "Inactive";
  if (value === "internal") return "Internal only";
  return publicLabel;
}

function locationIdCell(row, index) {
  const label = locationDisplayId(row, index);
  if (!row.id) return `<span class="muted-cell">${escapeHtml(label)}</span>`;
  return `<a href="${escapeAttribute(dashboardTableUrl(TABLES.locations))}" target="_blank" rel="noopener" title="Supabase UUID: ${escapeAttribute(row.id)}">${escapeHtml(label)}</a>`;
}

function locationDisplayId(row, index) {
  if (row.location_code) return row.location_code;
  if (!row.id) return "LID-New";
  return `LID-${String(index + 1).padStart(5, "0")}`;
}

function datasetIdCell(row, index) {
  const label = datasetDisplayId(row, index);
  if (!row.id) return `<span class="muted-cell">${escapeHtml(label)}</span>`;
  return `<a href="${escapeAttribute(dashboardTableUrl(TABLES.datasets))}" target="_blank" rel="noopener" title="Supabase UUID: ${escapeAttribute(row.id)}">${escapeHtml(label)}</a>`;
}

function datasetDisplayId(row, index) {
  if (row.dataset_code) return row.dataset_code;
  if (!row.id) return "DID-New";
  return `DID-${String(index + 1).padStart(5, "0")}`;
}

function datasetRegionValue(row) {
  return row.tide_location_region || row.tide_location_country || "";
}

function supportsDatasetRegionField() {
  return state.datasets.some((row) => Object.prototype.hasOwnProperty.call(row, "tide_location_region"));
}

function tideRegionOptions(selectedValue) {
  const baseOptions = [
    ["Kenya", "Kenya"],
    ["Tanzania", "Tanzania"],
    ["Regional", "Regional / mixed"]
  ];

  if (selectedValue && !baseOptions.some(([value]) => value === selectedValue)) {
    return [[selectedValue, selectedValue], ...baseOptions];
  }

  return baseOptions;
}

function countryForRegion(region) {
  const text = String(region || "").toLowerCase();
  if (text.includes("tanzania")) return "Tanzania";
  if (text.includes("regional")) return "Regional";
  return "Kenya";
}

function locationUseValue(row) {
  return recordUseValue(row);
}

function locationUseOptions() {
  return recordUseOptions("Shown in app");
}

function recordUseValue(row) {
  if (row.active === false) return "inactive";
  if (row.public_visible === false) return "internal";
  return "public";
}

function recordUseOptions(publicLabel = "Public") {
  return [
    ["public", publicLabel],
    ["internal", "Internal only"],
    ["inactive", "Inactive"]
  ];
}

function locationStatusForUse(appUse) {
  if (appUse === "inactive") return "inactive";
  if (appUse === "internal") return "reference_only";
  return "active";
}

function idLink(id, tableName) {
  if (!id) return `<span class="muted-cell">New row</span>`;
  return `<a href="${escapeAttribute(dashboardTableUrl(tableName))}" target="_blank" rel="noopener" title="${escapeAttribute(id)}">${escapeHtml(shortId(id))}</a>`;
}

function dashboardTableUrl(tableName) {
  return `https://supabase.com/dashboard/project/${APP_CONFIG.supabase.projectRef}/editor?schema=public&table=${encodeURIComponent(tableName)}`;
}

function textInput(field, value, label) {
  return `<input data-field="${escapeAttribute(field)}" type="text" value="${escapeAttribute(valueOrEmpty(value))}" aria-label="${escapeAttribute(label)}">`;
}

function numberInput(field, value, label, min, max, step) {
  return `<input data-field="${escapeAttribute(field)}" type="number" value="${escapeAttribute(valueOrEmpty(value))}" min="${min}" max="${max}" step="${step}" aria-label="${escapeAttribute(label)}">`;
}

function dateInput(field, value) {
  return `<input data-field="${escapeAttribute(field)}" type="date" value="${escapeAttribute(valueOrEmpty(value))}" aria-label="${escapeAttribute(formatStatus(field))}">`;
}

function selectInput(field, selectedValue, options) {
  const optionHtml = options.map(([value, label]) => {
    const selected = String(value || "") === String(selectedValue || "") ? " selected" : "";
    return `<option value="${escapeAttribute(value)}"${selected}>${escapeHtml(label)}</option>`;
  }).join("");
  return `<select data-field="${escapeAttribute(field)}" aria-label="${escapeAttribute(formatStatus(field))}">${optionHtml}</select>`;
}

function checkboxInput(field, checked, label) {
  return `
    <label>
      <input data-field="${escapeAttribute(field)}" type="checkbox"${checked ? " checked" : ""}>
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function rowValue(rowElement, field) {
  const input = rowElement.querySelector(`[data-field="${field}"]`);
  if (!input) return "";
  if (input.type === "checkbox") return input.checked;
  return input.value;
}

function setConnectionStatus(text, extraClass) {
  els.adminConnectionStatus.textContent = text;
  els.adminConnectionStatus.className = `status-pill ${extraClass || ""}`.trim();
}

function setAuthStatus(message, type = "") {
  els.adminAuthStatus.textContent = message;
  els.adminAuthStatus.dataset.status = type;
}

function setStatus(element, message, type = "") {
  if (!element) return;
  element.textContent = message || "";
  element.dataset.status = type;
}

async function responseDetail(response) {
  try {
    const errorBody = await response.json();
    const detail = errorBody.message || errorBody.details || errorBody.hint || "";
    return detail ? ` - ${detail}` : "";
  } catch {
    const detail = await response.text();
    return detail ? ` - ${detail}` : "";
  }
}

async function authErrorMessage(response) {
  try {
    const body = await response.json();
    return body.msg || body.message || body.error_description || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

function writeErrorMessage(error) {
  const message = error?.message || String(error);
  if (/401|403|permission|policy|row-level|JWT/i.test(message)) {
    return `${message}. Writes need an authenticated admin policy. The service-role key must not be placed in this page.`;
  }
  return message;
}

function requiredText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function nullableText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function nullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number;
}

function normalizeKey(value) {
  return requiredText(value, "Location key")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeDatasetKey(value) {
  return requiredText(value, "Dataset key")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function yearFromDate(value) {
  const match = String(value || "").match(/^(\d{4})-/);
  return match ? Number(match[1]) : new Date().getFullYear();
}

function valueOrEmpty(value) {
  return value === null || value === undefined ? "" : String(value);
}

function shortId(id) {
  if (!id) return "New";
  return `${id.slice(0, 8)}...`;
}

function formatStatus(value) {
  return String(value || "unknown").replace(/_/g, " ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
