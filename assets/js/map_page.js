import { loadPublicFarmLocations, loadPublicTideReferences } from "./tide_data.js?v=20260611-public-reads";

const KENYA_COAST_VIEW = {
  center: [-4.45, 39.45],
  zoom: 8
};

const els = {};
const markersByKey = new Map();
let map;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  bindEvents();
  setStatus("Loading locations", "muted");

  const result = await loadMapData();
  const farms = result.locations;
  const references = result.references;
  const mappedFarms = farms.filter(hasGps);
  const missingFarms = farms.filter((location) => !hasGps(location));
  const mappedReferences = references.filter(hasGps);

  renderLists(mappedFarms, missingFarms, references);
  renderMap(mappedFarms, references);
  els.mapDataSource.textContent = result.sourceLabel;
  els.mappedCount.textContent = `${mappedFarms.length}`;
  els.referenceCount.textContent = `${mappedReferences.length}`;
  els.missingCount.textContent = `${missingFarms.length}`;

  if (mappedFarms.length || mappedReferences.length) {
    setStatus(
      `${mappedFarms.length} farm${mappedFarms.length === 1 ? "" : "s"}, ${mappedReferences.length} reference${mappedReferences.length === 1 ? "" : "s"}`,
      "ready"
    );
  } else {
    setStatus("GPS needed", "muted");
  }
}

function cacheElements() {
  [
    "farmMap",
    "mapFallback",
    "mapStatus",
    "mapDataSource",
    "mappedCount",
    "referenceCount",
    "missingCount",
    "mappedLocationList",
    "tideReferenceList",
    "missingLocationList"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  els.mappedLocationList.addEventListener("click", focusMarkerFromEvent);
  els.tideReferenceList.addEventListener("click", focusMarkerFromEvent);
  els.mappedLocationList.addEventListener("keydown", focusMarkerFromEvent);
  els.tideReferenceList.addEventListener("keydown", focusMarkerFromEvent);
}

function focusMarkerFromEvent(event) {
  if (event.type === "click" && event.target.closest("a")) return;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;

  const item = event.target.closest("[data-focus-marker]");
  if (!item) return;

  event.preventDefault();
  focusMarker(item.dataset.focusMarker);
}

async function loadMapData() {
  const [farmResult, referenceResult] = await Promise.all([
    loadPublicFarmLocations(),
    loadPublicTideReferences()
  ]);

  return {
    locations: farmResult.locations.filter(isFarmLocation).map(normalizeLocationForMap),
    references: referenceResult.references.map(normalizeReferenceForMap),
    sourceLabel: `${farmResult.sourceLabel}; ${referenceResult.sourceLabel}`
  };
}

function normalizeLocationForMap(location) {
  return {
    ...location,
    latitude: Number(location.gps?.lat),
    longitude: Number(location.gps?.lon),
    regionCountry: formatRegionCountry(location.region, location.country)
  };
}

function normalizeReferenceForMap(reference) {
  return {
    ...reference,
    latitude: Number(reference.latitude),
    longitude: Number(reference.longitude),
    regionCountry: reference.datasetName || reference.sourceName || "Tide reference"
  };
}

function hasGps(record) {
  return Number.isFinite(record.latitude) && Number.isFinite(record.longitude);
}

function isFarmLocation(location) {
  const status = String(location.status || "").toLowerCase();
  return location.appUse !== false && !status.includes("reference");
}

function renderMap(mappedFarms, tideReferences) {
  if (!window.L) {
    showMapFallback("Map library could not be loaded. Check the internet connection for Leaflet and OpenStreetMap tiles.");
    return;
  }

  markersByKey.clear();
  map = window.L.map(els.farmMap, {
    scrollWheelZoom: true
  }).setView(KENYA_COAST_VIEW.center, KENYA_COAST_VIEW.zoom);

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  const mappedReferences = tideReferences.filter(hasGps);

  if (!mappedFarms.length && !mappedReferences.length) {
    showMapFallback("No farm or tide-reference GPS coordinates are available yet.");
    return;
  }

  const bounds = [];

  mappedFarms.forEach((location) => {
    const position = [location.latitude, location.longitude];
    bounds.push(position);

    const marker = window.L.marker(position, { icon: markerIcon("farm", "&#127807;") })
      .addTo(map)
      .bindPopup(renderFarmPopup(location));
    markersByKey.set(markerKey("farm", location.key), marker);
  });

  mappedReferences.forEach((reference) => {
    const position = [reference.latitude, reference.longitude];
    bounds.push(position);

    const marker = window.L.marker(position, { icon: markerIcon("tide-reference", "&#8776;") })
      .addTo(map)
      .bindPopup(renderReferencePopup(reference));
    markersByKey.set(markerKey("reference", reference.key), marker);
  });

  map.fitBounds(bounds, {
    padding: [42, 42],
    maxZoom: 12
  });

  window.setTimeout(() => map.invalidateSize(), 100);
}

function focusMarker(key) {
  const marker = markersByKey.get(key);
  if (!map || !marker) return;

  const targetZoom = Math.max(map.getZoom(), 13);
  map.flyTo(marker.getLatLng(), targetZoom, { duration: 0.45 });
  window.setTimeout(() => marker.openPopup(), 480);
  setActiveListItem(key);
  els.farmMap.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function setActiveListItem(key) {
  document.querySelectorAll("[data-focus-marker]").forEach((item) => {
    item.classList.toggle("active", item.dataset.focusMarker === key);
  });
}

function markerIcon(type, symbolHtml) {
  return window.L.divIcon({
    className: "",
    html: `<span class="map-marker-icon ${type}">${symbolHtml}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -15]
  });
}

function showMapFallback(message) {
  els.mapFallback.hidden = false;
  els.mapFallback.textContent = message;
}

function renderFarmPopup(location) {
  return `
    <div class="map-popup">
      <strong>${escapeHtml(location.name)}</strong>
      <span>${escapeHtml(location.regionCountry)}</span>
      <small>${escapeHtml(formatCoordinate(location.latitude))}, ${escapeHtml(formatCoordinate(location.longitude))}</small>
      <a href="${tideUrl(location)}">Open tide planner</a>
    </div>
  `;
}

function renderReferencePopup(reference) {
  return `
    <div class="map-popup">
      <strong>${escapeHtml(reference.name)}</strong>
      <span>${escapeHtml(reference.datasetName)}</span>
      <small>${escapeHtml(reference.status || "status not set")}</small>
    </div>
  `;
}

function renderLists(mappedFarms, missingFarms, references) {
  els.mappedLocationList.innerHTML = mappedFarms.length
    ? mappedFarms.map(renderMappedLocation).join("")
    : `<div class="empty-state">No farm locations have confirmed GPS coordinates yet.</div>`;

  els.tideReferenceList.innerHTML = references.length
    ? references.map(renderTideReference).join("")
    : `<div class="empty-state">No tide references have coordinates yet.</div>`;

  els.missingLocationList.innerHTML = missingFarms.length
    ? missingFarms.map(renderMissingLocation).join("")
    : `<div class="empty-state">All farm locations have GPS coordinates.</div>`;
}

function renderMappedLocation(location) {
  return `
    <article class="map-location-item farm" tabindex="0" role="button" data-focus-marker="${escapeAttribute(markerKey("farm", location.key))}" aria-label="Show ${escapeAttribute(location.name)} on the map">
      <div>
        <strong>${escapeHtml(location.name)}</strong>
        <span>${escapeHtml(location.regionCountry)}</span>
        <small>${escapeHtml(formatCoordinate(location.latitude))}, ${escapeHtml(formatCoordinate(location.longitude))}</small>
      </div>
      <a href="${tideUrl(location)}">Open</a>
    </article>
  `;
}

function renderTideReference(reference) {
  return `
    <article class="map-location-item tide-reference" tabindex="0" role="button" data-focus-marker="${escapeAttribute(markerKey("reference", reference.key))}" aria-label="Show ${escapeAttribute(reference.name)} on the map">
      <div>
        <strong>${escapeHtml(reference.name)}</strong>
        <span>${escapeHtml(reference.datasetName)}</span>
        <small>${hasGps(reference) ? `${escapeHtml(formatCoordinate(reference.latitude))}, ${escapeHtml(formatCoordinate(reference.longitude))}` : "GPS to be confirmed"}</small>
      </div>
    </article>
  `;
}

function renderMissingLocation(location) {
  return `
    <article class="map-location-item muted">
      <div>
        <strong>${escapeHtml(location.name)}</strong>
        <span>${escapeHtml(location.regionCountry)}</span>
        <small>${escapeHtml(location.gpsLabel || "GPS to be confirmed")}</small>
      </div>
      <a href="${tideUrl(location)}">Open</a>
    </article>
  `;
}

function tideUrl(location) {
  return `./index.html?location=${encodeURIComponent(location.key)}`;
}

function markerKey(type, key) {
  return `${type}:${key}`;
}

function formatCoordinate(value) {
  return Number(value).toFixed(5);
}

function formatRegionCountry(region, country) {
  return [region, country].filter(Boolean).join(", ");
}

function setStatus(text, status) {
  els.mapStatus.textContent = text;
  els.mapStatus.classList.toggle("status-muted", status !== "ready");
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
