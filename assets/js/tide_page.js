import { APP_CONFIG } from "./config.js?v=20260611-public-reads";
import { getDataStatus, getLocations, getProfiles, loadPublicFarmLocations } from "./tide_data.js?v=20260611-public-reads";
import {
  findNextHarvestLow,
  moonEvents,
  moonIllumination,
  moonPhase,
  moonPhaseName,
  nextMoonEvent,
  rangeAroundNow,
  springWindows,
  tideCurve,
  tideExtremes,
  tideHeight
} from "./tide_core.js";
import {
  addDaysToDateKey,
  addMonthsToDateKey,
  dateKeyToUtcDate,
  daysInMonth,
  formatDate,
  formatDateTime,
  formatMetres,
  formatMonth,
  formatPercent,
  formatTime,
  localDateKey,
  startOfMonthKey,
  statusLabel,
  weekdayIndex
} from "./tide_format.js";
import { renderTideChart } from "./tide_charts.js?v=20260611-threshold-label-gutter";

const state = {
  location: null,
  profile: null,
  thresholdM: 0.7,
  thresholdEnabled: true,
  forecastDays: 7,
  lowListDays: 14,
  lastForecast: null
};

const els = {};
let tideLocations = getLocations();
const TIDE_PROFILES = getProfiles();
const SYMBOLS = {
  plant: "\uD83C\uDF3F",
  newMoon: "\uD83C\uDF11",
  fullMoon: "\uD83C\uDF15",
  down: "\u25BC"
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  await loadLocationRecords();
  populateLocationSelect();
  bindEvents();
  setLocation(resolveInitialLocationKey(), { updateUrl: false });
  window.setInterval(renderClock, 30000);
}

function cacheElements() {
  [
    "locationSelect",
    "locationMeta",
    "localClock",
    "timeZoneLabel",
    "verificationBadge",
    "datasetBadge",
    "thresholdEnabled",
    "thresholdInput",
    "thresholdDefault",
    "referenceStationLine",
    "currentTideState",
    "todayTidesDate",
    "todayLowTides",
    "todayHighTides",
    "harvestWindow",
    "harvestStartLabel",
    "harvestStartLow",
    "harvestLowestLow",
    "harvestEndLabel",
    "harvestEndLow",
    "moonPhase",
    "moonIllumination",
    "nextNewMoon",
    "nextFullMoon",
    "tideChart7d",
    "tideChartOverview",
    "overviewHarvestWindows",
    "lowTideList",
    "lowTideRangeLabel",
    "loadMoreLows",
    "harvestCalendar",
    "sourceDetails",
    "safetyDetails",
    "locationDetails",
    "lastUpdated"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });

  els.forecastRangeLabel = document.getElementById("forecastRangeLabel");
  els.forecastRangeButtons = Array.from(document.querySelectorAll("[data-forecast-days]"));
}

async function loadLocationRecords() {
  const result = await loadPublicFarmLocations();
  if (Array.isArray(result.locations) && result.locations.length) {
    tideLocations = result.locations;
  }
}

function populateLocationSelect() {
  els.locationSelect.innerHTML = tideLocations.map((location) => {
    return `<option value="${escapeHtml(location.key)}">${escapeHtml(location.name)}</option>`;
  }).join("");
}

function bindEvents() {
  els.locationSelect.addEventListener("change", () => {
    setLocation(els.locationSelect.value, { updateUrl: true });
  });

  els.thresholdEnabled.addEventListener("change", () => {
    state.thresholdEnabled = els.thresholdEnabled.checked;
    saveThresholdState();
    render();
  });

  els.thresholdInput.addEventListener("input", () => {
    state.thresholdM = clampThreshold(Number(els.thresholdInput.value));
    saveThresholdState();
    render();
  });

  els.thresholdDefault.addEventListener("click", () => {
    state.thresholdM = getDefaultThreshold(state.location, state.profile);
    state.thresholdEnabled = true;
    saveThresholdState();
    syncThresholdControls();
    render();
  });

  els.forecastRangeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const days = Number(button.dataset.forecastDays);
      if (![3, 5, 7].includes(days) || days === state.forecastDays) return;

      state.forecastDays = days;
      syncForecastRangeControls();
      render();
    });
  });

  els.loadMoreLows.addEventListener("click", () => {
    state.lowListDays += 14;
    renderLowTides();
  });

  window.addEventListener("resize", debounce(() => {
    if (state.lastForecast) renderCharts(state.lastForecast);
  }, 150));
}

function resolveInitialLocationKey() {
  const params = new URLSearchParams(window.location.search);
  const queryLocation = params.get("location");
  if (getLocation(queryLocation)) return queryLocation;

  const saved = readStorage(APP_CONFIG.storageKeys.selectedLocation);
  if (getLocation(saved)) return saved;

  return APP_CONFIG.defaultLocationKey;
}

function setLocation(locationKey, options = {}) {
  const location = getLocation(locationKey) || getLocation(APP_CONFIG.defaultLocationKey) || tideLocations[0];
  const profile = TIDE_PROFILES[location.tideProfileKey] || TIDE_PROFILES.kenya_mombasa_reference;

  state.location = location;
  state.profile = profile;
  state.lowListDays = 14;
  loadThresholdState();
  syncThresholdControls();

  els.locationSelect.value = location.key;
  writeStorage(APP_CONFIG.storageKeys.selectedLocation, location.key);

  if (options.updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set("location", location.key);
    window.history.replaceState({}, "", url);
  }

  render();
}

function render() {
  if (!state.location || !state.profile) return;

  renderClock();
  renderLocationSummary();
  syncThresholdControls();
  syncForecastRangeControls();

  const now = new Date();
  const forecastRange = rangeAroundNow(now, 1, 95);
  const fullCurve = tideCurve(state.profile, forecastRange.start, forecastRange.end, 30);
  const fullExtremes = tideExtremes(fullCurve);
  const weekRange = rangeAroundNow(now, 0.15, state.forecastDays);
  const weekCurve = tideCurve(state.profile, weekRange.start, weekRange.end, 20);
  const weekExtremes = tideExtremes(weekCurve);
  const moons = moonEvents(now, forecastRange.end);
  const springs = springWindows(now, forecastRange.end);

  state.lastForecast = {
    now,
    forecastRange,
    weekRange,
    fullCurve,
    fullExtremes,
    weekCurve,
    weekExtremes,
    moons,
    springs
  };

  renderSummaryCards(state.lastForecast);
  renderMoon(now);
  renderCharts(state.lastForecast);
  renderLowTides();
  renderCalendar(state.lastForecast);
  renderSourceDetails();
  renderSafetyDetails();
}

function renderClock() {
  if (!state.profile) return;
  const now = new Date();
  els.localClock.textContent = formatDateTime(now, state.profile.timezone);
  els.timeZoneLabel.textContent = `Times shown in ${state.profile.timezone}`;
}

function renderLocationSummary() {
  const { location, profile } = state;
  const dataStatus = getDataStatus();
  els.locationMeta.textContent = `${location.region}, ${location.country}`;
  els.verificationBadge.textContent = statusLabel(profile.verificationStatus);
  els.verificationBadge.dataset.status = profile.verificationStatus;
  els.datasetBadge.textContent = profile.version;

  const gps = location.gps
    ? `${location.gps.lat.toFixed(5)}, ${location.gps.lon.toFixed(5)}`
    : location.gpsLabel;

  els.locationDetails.innerHTML = `
    <span><strong>Location:</strong> ${escapeHtml(location.name)}</span>
    <span><strong>GPS:</strong> ${escapeHtml(gps || "To be confirmed")}</span>
    <span><strong>Profile:</strong> ${escapeHtml(profile.name)}</span>
    <span><strong>Backend:</strong> ${escapeHtml(dataStatus.backendContext)}</span>
    <span><strong>Supabase ref:</strong> ${escapeHtml(dataStatus.supabaseProjectRef)}</span>
    <span><strong>Data mode:</strong> ${escapeHtml(dataStatus.mode)}</span>
  `;

  els.referenceStationLine.innerHTML = `
    Reference station: ${escapeHtml(profile.name)} - harmonic prediction - constituents:
    <a href="${escapeAttribute(profile.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(profile.sourceName)}</a>
  `;
}

function renderSummaryCards(forecast) {
  const nextHarvest = findNextHarvestLow(
    forecast.fullExtremes,
    forecast.now,
    state.thresholdM,
    state.thresholdEnabled
  );

  renderTodayTides(forecast);

  if (nextHarvest) {
    renderHarvestSummary(nextHarvest, forecast);
  } else if (!state.thresholdEnabled) {
    resetHarvestSummary("Harvest threshold hidden");
  } else {
    resetHarvestSummary("No harvest window in range");
  }

  els.lastUpdated.textContent = `Updated ${formatTime(forecast.now, state.profile.timezone)}`;
}

function renderTodayTides(forecast) {
  const todayKey = localDateKey(forecast.now, state.profile.timezone);
  const dayRange = localDayRange(todayKey, state.profile.timezone);
  const dayCurve = tideCurve(state.profile, dayRange.start, dayRange.end, 10);
  const dayExtremes = tideExtremes(dayCurve);
  const currentHeight = tideHeight(forecast.now, state.profile);
  const nextHeight = tideHeight(new Date(forecast.now.getTime() + 10 * 60000), state.profile);
  const trend = tideTrendLabel(currentHeight, nextHeight);
  const lows = dayExtremes.filter((extreme) => extreme.type === "low").sort((a, b) => a.timeMs - b.timeMs);
  const highs = dayExtremes.filter((extreme) => extreme.type === "high").sort((a, b) => a.timeMs - b.timeMs);

  els.todayTidesDate.textContent = `(${formatDate(forecast.now, state.profile.timezone)})`;
  els.currentTideState.textContent =
    `${trend} (${formatMetres(currentHeight)}) at ${formatTime(forecast.now, state.profile.timezone)} local time`;
  els.todayLowTides.textContent = lows.length ? lows.map(formatEventTimeHeight).join("   ") : "--";
  els.todayHighTides.textContent = highs.length ? highs.map(formatEventTimeHeight).join("   ") : "--";
}

function tideTrendLabel(currentHeight, nextHeight) {
  const delta = nextHeight - currentHeight;
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.005) return "Slack";
  return delta > 0 ? "Flooding" : "Ebbing";
}

function renderHarvestSummary(nextHarvest, forecast) {
  const harvestWindow = nextHarvestWindow(forecast, nextHarvest);
  if (!harvestWindow) {
    resetHarvestSummary("No harvest window in range");
    return;
  }

  const startLow = lowestLowForLocalDay(harvestWindow.start);
  const endLow = lowestLowForLocalDay(harvestWindow.end);
  const lowestLow = lowestLowBetween(harvestWindow.start, harvestWindow.end);

  els.harvestWindow.textContent =
    `${formatDate(harvestWindow.start, state.profile.timezone)} - ${formatDate(harvestWindow.end, state.profile.timezone)}`;
  els.harvestStartLabel.textContent = `Low Tide ${formatDayMonth(harvestWindow.start)}:`;
  els.harvestStartLow.textContent = startLow ? formatEventTimeHeight(startLow) : "--";
  els.harvestLowestLow.textContent = lowestLow
    ? `${formatMetres(lowestLow.heightM)} (${formatDayMonth(lowestLow.date)})`
    : "--";
  els.harvestEndLabel.textContent = `Low Tide ${formatDayMonth(harvestWindow.end)}:`;
  els.harvestEndLow.textContent = endLow ? formatEventTimeHeight(endLow) : "--";
}

function resetHarvestSummary(message) {
  els.harvestWindow.textContent = message;
  els.harvestStartLabel.textContent = "Low Tide:";
  els.harvestStartLow.textContent = "--";
  els.harvestLowestLow.textContent = "--";
  els.harvestEndLabel.textContent = "Low Tide:";
  els.harvestEndLow.textContent = "--";
}

function nextHarvestWindow(forecast, nextHarvest) {
  const ranges = buildHarvestDayRanges(
    forecast.now,
    forecast.forecastRange.end,
    state.profile,
    state.thresholdM,
    state.thresholdEnabled
  );
  const windows = groupAdjacentRanges(ranges, 86400000 * 1.1);
  const harvestTime = nextHarvest.timeMs;

  return (
    windows.find((window) => harvestTime >= window.start.getTime() && harvestTime <= window.end.getTime()) ||
    windows.find((window) => window.end.getTime() >= forecast.now.getTime()) ||
    null
  );
}

function groupAdjacentRanges(ranges, gapMs) {
  return ranges
    .slice()
    .sort((a, b) => a.start - b.start)
    .reduce((groups, range) => {
      const previous = groups[groups.length - 1];
      if (previous && range.start.getTime() - previous.end.getTime() <= gapMs) {
        previous.end = new Date(Math.max(previous.end.getTime(), range.end.getTime()));
      } else {
        groups.push({ start: new Date(range.start), end: new Date(range.end) });
      }
      return groups;
    }, []);
}

function localDayRange(dateKey, timeZone) {
  const start = zonedDateKeyToDate(dateKey, timeZone);
  const end = new Date(zonedDateKeyToDate(addDaysToDateKey(dateKey, 1), timeZone).getTime() - 60000);
  return { start, end };
}

function lowestLowForLocalDay(date) {
  const dayRange = localDayRange(localDateKey(date, state.profile.timezone), state.profile.timezone);
  return lowestLowBetween(dayRange.start, dayRange.end);
}

function lowestLowBetween(startDate, endDate) {
  const curve = tideCurve(state.profile, startDate, endDate, 10);
  const lows = tideExtremes(curve).filter((extreme) => extreme.type === "low");
  if (!lows.length) return null;
  return lows.reduce((lowest, low) => (low.heightM < lowest.heightM ? low : lowest), lows[0]);
}

function formatEventTimeHeight(extreme) {
  return `${formatTime(extreme.date, state.profile.timezone)} (${formatMetres(extreme.heightM)})`;
}

function formatDayMonth(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: state.profile.timezone,
    day: "numeric",
    month: "long"
  }).format(date);
}

function formatDayMonthShort(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: state.profile.timezone,
    day: "numeric",
    month: "short"
  }).format(date);
}

function renderMoon(now) {
  const phase = moonPhase(now);
  const nextNew = nextMoonEvent(now, 0);
  const nextFull = nextMoonEvent(now, 0.5);

  els.moonPhase.textContent = moonPhaseName(phase);
  els.moonIllumination.textContent = `${formatPercent(moonIllumination(phase))} illuminated`;
  els.nextNewMoon.textContent = formatDateTime(nextNew, state.profile.timezone);
  els.nextFullMoon.textContent = formatDateTime(nextFull, state.profile.timezone);
}

function renderCharts(forecast) {
  const weekHarvestWindows = buildHarvestDayRanges(
    forecast.weekRange.start,
    forecast.weekRange.end,
    state.profile,
    state.thresholdM,
    state.thresholdEnabled
  );
  const overviewHarvestWindows = buildHarvestDayRanges(
    forecast.forecastRange.start,
    forecast.forecastRange.end,
    state.profile,
    state.thresholdM,
    state.thresholdEnabled
  );
  const groupedOverviewHarvestWindows = groupAdjacentRanges(overviewHarvestWindows, 86400000 * 1.1);

  renderOverviewHarvestWindowSummary(groupedOverviewHarvestWindows);

  renderTideChart(els.tideChart7d, forecast.weekCurve, forecast.weekExtremes, {
    timeZone: state.profile.timezone,
    thresholdEnabled: state.thresholdEnabled,
    thresholdM: state.thresholdM,
    now: forecast.now,
    leftPadding: 96,
    compact: false,
    legendSpace: true,
    timeGrid: "half-day",
    thresholdShadeMode: "harvest-windows",
    harvestWindows: weekHarvestWindows,
    thresholdLabelPosition: "left-of-axis"
  });

  renderTideChart(els.tideChartOverview, forecast.fullCurve, forecast.fullExtremes, {
    timeZone: state.profile.timezone,
    thresholdEnabled: state.thresholdEnabled,
    thresholdM: state.thresholdM,
    now: forecast.now,
    compact: true,
    timeGrid: "month",
    monthBanding: true,
    topPadding: 34,
    leftPadding: 96,
    showExtremes: false,
    thresholdShadeMode: "harvest-windows",
    harvestWindows: groupedOverviewHarvestWindows,
    harvestWindowLabel: formatChartHarvestWindowLabel,
    harvestWindowLabelMinWidth: 54,
    harvestWindowLabelPosition: "above-plot",
    harvestWindowLabelOffset: 13,
    thresholdLabelPosition: "left-of-axis"
  });
}

function renderOverviewHarvestWindowSummary(windows) {
  if (!els.overviewHarvestWindows) return;

  if (!state.thresholdEnabled) {
    els.overviewHarvestWindows.innerHTML = `<span>Harvest threshold hidden.</span>`;
    return;
  }

  if (!windows.length) {
    els.overviewHarvestWindows.innerHTML = `<span>No harvest windows in this 3-month range.</span>`;
    return;
  }

  els.overviewHarvestWindows.innerHTML = `
    <strong>Harvest windows:</strong>
    ${windows.map((window) => `<span class="harvest-window-chip">${escapeHtml(formatHarvestWindowRange(window))}</span>`).join("")}
  `;
}

function formatChartHarvestWindowLabel(window) {
  const start = new Date(Number(window.start));
  const end = new Date(Number(window.end));
  return formatHarvestWindowRange({ start, end });
}

function formatHarvestWindowRange(window) {
  const start = window.start instanceof Date ? window.start : new Date(Number(window.start));
  const end = window.end instanceof Date ? window.end : new Date(Number(window.end));
  const startKey = localDateKey(start, state.profile.timezone);
  const endKey = localDateKey(end, state.profile.timezone);
  const sameMonth = startKey.slice(0, 7) === endKey.slice(0, 7);

  if (startKey === endKey) {
    return formatDayMonthShort(start);
  }

  if (sameMonth) {
    return `${Number(startKey.slice(8, 10))}-${formatDayMonthShort(end)}`;
  }

  return `${formatDayMonthShort(start)}-${formatDayMonthShort(end)}`;
}

function buildHarvestDayRanges(startDate, endDate, profile, thresholdM, enabled) {
  if (!enabled || !profile || !Number.isFinite(thresholdM)) return [];

  const ranges = [];
  let dateKey = localDateKey(startDate, profile.timezone);
  const endKey = localDateKey(endDate, profile.timezone);

  while (dateKey <= endKey) {
    const dayStart = zonedDateKeyToDate(dateKey, profile.timezone);
    const nextDateKey = addDaysToDateKey(dateKey, 1);
    const dayEnd = new Date(zonedDateKeyToDate(nextDateKey, profile.timezone).getTime() - 60000);
    const curve = tideCurve(profile, dayStart, dayEnd, 30);
    const lows = tideExtremes(curve).filter((extreme) => extreme.type === "low");
    const lowest = lows.reduce((min, low) => Math.min(min, low.heightM), Infinity);

    if (lowest <= thresholdM) {
      ranges.push({ start: dayStart, end: dayEnd });
    }

    dateKey = nextDateKey;
  }

  return ranges;
}

function zonedDateKeyToDate(dateKey, timeZone) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const targetMs = Date.UTC(year, month - 1, day, 0, 0, 0);
  let utcMs = targetMs;

  for (let i = 0; i < 4; i += 1) {
    const parts = zonedParts(new Date(utcMs), timeZone);
    const renderedMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const deltaMs = renderedMs - targetMs;
    if (Math.abs(deltaMs) < 1000) break;
    utcMs -= deltaMs;
  }

  return new Date(utcMs);
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
}

function renderLowTides() {
  const forecast = state.lastForecast;
  if (!forecast) return;

  const endMs = forecast.now.getTime() + state.lowListDays * 86400000;
  const lows = forecast.fullExtremes.filter((extreme) => {
    return extreme.type === "low" && extreme.timeMs >= forecast.now.getTime() && extreme.timeMs <= endMs;
  });
  const dailyLows = lowestLowPerLocalDay(lows);
  const moonByDay = moonMapByLocalDay(forecast.moons);
  const springLowDays = springLowDaySet(dailyLows, forecast.springs);
  const tableHarvestWindows = groupAdjacentRanges(
    buildHarvestDayRanges(
      forecast.now,
      new Date(endMs),
      state.profile,
      state.thresholdM,
      state.thresholdEnabled
    ),
    86400000 * 1.1
  );

  els.lowTideRangeLabel.textContent = `next ${state.lowListDays} days`;

  if (!dailyLows.length) {
    els.lowTideList.innerHTML = `<tr><td colspan="4" class="empty-state">No upcoming low tides found in this range.</td></tr>`;
    return;
  }

  els.lowTideList.innerHTML = dailyLows.map((low) => {
    const dateKey = localDateKey(low.date, state.profile.timezone);
    const isHarvest = state.thresholdEnabled && low.heightM <= state.thresholdM;
    const isSpringLow = isHarvest && springLowDays.has(dateKey);
    const moon = moonByDay.get(dateKey);
    const windowInfo = harvestWindowInfoForDate(dateKey, tableHarvestWindows);
    const status = renderLowTideStatus(isHarvest, isSpringLow, moon, windowInfo);
    const rowClass = isHarvest ? "harvest-row" : "";

    return `
      <tr class="${rowClass}">
        <td>${escapeHtml(formatDate(low.date, state.profile.timezone))}</td>
        <td>${escapeHtml(formatTime(low.date, state.profile.timezone))}</td>
        <td>${escapeHtml(formatMetres(low.heightM))}</td>
        <td>${status}</td>
      </tr>
    `;
  }).join("");
}

function lowestLowPerLocalDay(lows) {
  const byDay = new Map();

  for (const low of lows) {
    const dateKey = localDateKey(low.date, state.profile.timezone);
    const current = byDay.get(dateKey);
    if (!current || low.heightM < current.heightM) {
      byDay.set(dateKey, low);
    }
  }

  return Array.from(byDay.values()).sort((a, b) => a.timeMs - b.timeMs);
}

function moonMapByLocalDay(moons) {
  const map = new Map();

  for (const moon of moons) {
    map.set(localDateKey(moon.date, state.profile.timezone), moon);
  }

  return map;
}

function springLowDaySet(dailyLows, windows) {
  const days = new Set();

  for (const window of windows) {
    const lowsInWindow = dailyLows.filter((low) => {
      return low.timeMs >= window.start.getTime() && low.timeMs <= window.end.getTime();
    });
    if (!lowsInWindow.length) continue;

    const lowest = lowsInWindow.reduce((best, low) => {
      return low.heightM < best.heightM ? low : best;
    }, lowsInWindow[0]);
    days.add(localDateKey(lowest.date, state.profile.timezone));
  }

  return days;
}

function harvestWindowInfoForDate(dateKey, windows) {
  for (const window of windows) {
    const startKey = localDateKey(window.start, state.profile.timezone);
    const endKey = localDateKey(window.end, state.profile.timezone);
    if (dateKey < startKey || dateKey > endKey) continue;

    const sameDay = startKey === endKey;
    const role = sameDay ? "single" : dateKey === startKey ? "start" : dateKey === endKey ? "end" : "middle";
    return {
      role,
      label: formatHarvestWindowRange(window)
    };
  }

  return null;
}

function renderLowTideStatus(isHarvest, isSpringLow, moon, windowInfo) {
  const moonText = moon ? `<span class="moon-symbol-inline">${escapeHtml(moonSymbol(moon.type))}</span>` : "";
  const harvestText = harvestStatusText(windowInfo);

  if (isHarvest && isSpringLow) {
    return `${moonText}<span class="spring-low">${escapeHtml(SYMBOLS.plant)} Spring low - ${escapeHtml(harvestText)} ${escapeHtml(SYMBOLS.down)}</span>`;
  }

  if (isHarvest) {
    return `${moonText}<span class="harvest-text">${escapeHtml(SYMBOLS.plant)} ${escapeHtml(harvestText)}</span>`;
  }

  if (moon) {
    return `${moonText}`;
  }

  return "";
}

function harvestStatusText(windowInfo) {
  if (!windowInfo) return "Harvest";
  if (windowInfo.role === "single") return `Harvest day (${windowInfo.label})`;
  if (windowInfo.role === "start") return `Harvest start (${windowInfo.label})`;
  if (windowInfo.role === "end") return `Harvest end (${windowInfo.label})`;
  return `Harvest window (${windowInfo.label})`;
}

function moonSymbol(type) {
  return type === "full" ? SYMBOLS.fullMoon : SYMBOLS.newMoon;
}

function renderCalendar(forecast) {
  const todayKey = localDateKey(forecast.now, state.profile.timezone);
  const harvestDays = buildHarvestDays(forecast.fullExtremes, forecast.moons);
  const months = [0, 1, 2].map((offset) => startOfMonthKey(addMonthsToDateKey(todayKey, offset)));

  els.harvestCalendar.innerHTML = months.map((monthStartKey) => {
    const monthDate = dateKeyToUtcDate(monthStartKey);
    const monthLabel = formatMonth(monthDate, state.profile.timezone);
    const blanks = (weekdayIndex(monthStartKey) + 6) % 7;
    const totalDays = daysInMonth(monthStartKey);
    const cells = [];

    for (let i = 0; i < blanks; i += 1) {
      cells.push(`<div class="calendar-day empty" aria-hidden="true"></div>`);
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const dateKey = `${monthStartKey.slice(0, 8)}${String(day).padStart(2, "0")}`;
      const info = harvestDays.get(dateKey);
      const isToday = dateKey === todayKey;
      const isPast = dateKey < todayKey;
      const classes = [
        "calendar-day",
        info?.harvest ? "harvest" : "",
        info?.moonType ? "moon" : "",
        isToday ? "today" : "",
        isPast ? "past" : ""
      ].filter(Boolean).join(" ");
      const title = buildCalendarTitle(dateKey, info);

      cells.push(`
        <div class="${classes}" title="${escapeHtml(title)}">
          <span>${day}</span>
          ${info?.moonType ? `<small class="calendar-moon ${escapeHtml(info.moonType)}">${escapeHtml(moonSymbol(info.moonType))}</small>` : ""}
        </div>
      `);
    }

    return `
      <section class="calendar-month" aria-label="${escapeHtml(monthLabel)}">
        <h3>${escapeHtml(monthLabel)}</h3>
        <div class="calendar-grid calendar-head">
          <span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span>
        </div>
        <div class="calendar-grid">${cells.join("")}</div>
      </section>
    `;
  }).join("");
}

function buildHarvestDays(extremes, moons) {
  const dayMap = new Map();

  if (state.thresholdEnabled) {
    for (const low of extremes.filter((extreme) => extreme.type === "low")) {
      const dateKey = localDateKey(low.date, state.profile.timezone);
      const current = dayMap.get(dateKey) || { lows: [], harvest: false, minLow: Infinity, moonLabel: "" };
      current.lows.push(low);
      current.minLow = Math.min(current.minLow, low.heightM);
      current.harvest = current.harvest || low.heightM <= state.thresholdM;
      dayMap.set(dateKey, current);
    }
  }

  for (const moon of moons) {
    const dateKey = localDateKey(moon.date, state.profile.timezone);
    const current = dayMap.get(dateKey) || { lows: [], harvest: false, minLow: Infinity, moonType: "" };
    current.moonLabel = moon.type === "full" ? "Full" : "New";
    current.moonType = moon.type;
    dayMap.set(dateKey, current);
  }

  return dayMap;
}

function buildCalendarTitle(dateKey, info) {
  const bits = [dateKey];
  if (info?.harvest) bits.push(`harvest low, min ${formatMetres(info.minLow)}`);
  if (info?.moonLabel) bits.push(`${info.moonLabel} moon`);
  return bits.join(" - ");
}

function renderSourceDetails() {
  const { profile, location } = state;
  els.sourceDetails.innerHTML = `
    <div><strong>Source:</strong> <a href="${escapeAttribute(profile.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(profile.sourceName)}</a></div>
    <div><strong>Profile:</strong> ${escapeHtml(profile.name)}</div>
    <div><strong>Datum:</strong> ${escapeHtml(profile.datumLabel)}</div>
    <div><strong>Timezone:</strong> ${escapeHtml(profile.timezone)}</div>
    <div><strong>Verification:</strong> ${escapeHtml(profile.verificationLabel)}</div>
    <div><strong>Location note:</strong> ${escapeHtml(location.notes)}</div>
  `;
}

function renderSafetyDetails() {
  els.safetyDetails.innerHTML = `
    <p>${escapeHtml(state.profile.warningText)}</p>
    <p>This prototype is planning guidance only. Local weather, currents, access conditions, datum differences, and unverified datasets can change field safety. Do not use this as navigation-grade tide data.</p>
  `;
}

function getLocation(locationKey) {
  return tideLocations.find((location) => location.key === locationKey) || null;
}

function getDefaultThreshold(location, profile) {
  return Number(location?.defaultHarvestThresholdM || profile?.defaultHarvestThresholdM || 0.7);
}

function thresholdStorageKey() {
  return `${APP_CONFIG.storageKeys.thresholdPrefix}${state.location.key}`;
}

function thresholdEnabledStorageKey() {
  return `${APP_CONFIG.storageKeys.thresholdEnabledPrefix}${state.location.key}`;
}

function loadThresholdState() {
  const savedThresholdText = readStorage(thresholdStorageKey());
  const savedThreshold = savedThresholdText === null ? NaN : Number(savedThresholdText);
  const savedEnabled = readStorage(thresholdEnabledStorageKey());

  state.thresholdM = Number.isFinite(savedThreshold)
    ? clampThreshold(savedThreshold)
    : getDefaultThreshold(state.location, state.profile);
  state.thresholdEnabled = savedEnabled === null ? true : savedEnabled === "true";
}

function saveThresholdState() {
  writeStorage(thresholdStorageKey(), String(clampThreshold(state.thresholdM)));
  writeStorage(thresholdEnabledStorageKey(), String(state.thresholdEnabled));
}

function syncThresholdControls() {
  els.thresholdInput.value = state.thresholdM.toFixed(2);
  els.thresholdEnabled.checked = state.thresholdEnabled;
  els.thresholdInput.disabled = !state.thresholdEnabled;
}

function syncForecastRangeControls() {
  if (els.forecastRangeLabel) {
    els.forecastRangeLabel.textContent = `${state.forecastDays}-Day Tide Forecast`;
  }

  els.forecastRangeButtons.forEach((button) => {
    const isSelected = Number(button.dataset.forecastDays) === state.forecastDays;
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

function clampThreshold(value) {
  if (!Number.isFinite(value)) return 0.7;
  return Math.min(5, Math.max(0, value));
}

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in restricted browsers. The app still works for this session.
  }
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

function debounce(fn, waitMs) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), waitMs);
  };
}
