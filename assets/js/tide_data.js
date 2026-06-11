import { APP_CONFIG } from "./config.js?v=20260611-public-reads";
import { TIDE_LOCATIONS } from "../data/locations.js";
import { TIDE_PROFILES } from "../data/tide_profiles.js";

const DATASET_PROFILE_MAP = {
  kmfri_2026_mombasa: "kenya_mombasa_reference",
  kmfri_2026_lamu: "kenya_mombasa_reference",
  kpa_2026_kilindini: "kenya_mombasa_reference",
  fremantle_reference: "fremantle_reference"
};

export function getLocations() {
  return TIDE_LOCATIONS;
}

export function getProfiles() {
  return TIDE_PROFILES;
}

export function getDataStatus() {
  return {
    mode: APP_CONFIG.dataMode,
    backendContext: APP_CONFIG.backendContext,
    supabaseProjectRef: APP_CONFIG.supabase.projectRef,
    supabaseRestUrl: APP_CONFIG.supabase.restUrl,
    supabaseEnabled: APP_CONFIG.supabase.enabled,
    supabasePublicReadsEnabled: APP_CONFIG.supabase.publicReadsEnabled === true
  };
}

export async function fetchSupabaseTable(tableName, query = "select=*") {
  if (!canReadSupabase()) {
    throw new Error("Supabase reads are configured but not enabled yet.");
  }

  const path = `${APP_CONFIG.supabase.restUrl}/${encodeURIComponent(tableName)}?${query}`;
  const response = await fetch(path, {
    headers: {
      apikey: APP_CONFIG.supabase.anonKey,
      Authorization: `Bearer ${APP_CONFIG.supabase.anonKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`Supabase request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function loadPublicFarmLocations() {
  const staticLocations = getLocations();

  if (!canReadSupabase()) {
    return {
      locations: staticLocations,
      sourceLabel: "Using static prototype location records",
      source: "static"
    };
  }

  try {
    const rows = await fetchSupabaseTable(
      "farm_locations",
      "select=*&active=eq.true&public_visible=eq.true&order=farm_name.asc"
    );
    const locations = rows.map(normalizeSupabaseFarmLocation).filter(Boolean);

    if (locations.length) {
      return {
        locations,
        sourceLabel: "Using Supabase farm_locations",
        source: "supabase"
      };
    }
  } catch (error) {
    console.warn("Farm location read failed, using static locations.", error);
  }

  return {
    locations: staticLocations,
    sourceLabel: "Using static prototype location records",
    source: "static"
  };
}

export async function loadPublicTideReferences() {
  if (!canReadSupabase()) {
    return {
      references: [],
      sourceLabel: "No Supabase tide references loaded",
      source: "static"
    };
  }

  try {
    const rows = await fetchSupabaseTable(
      "tide_datasets",
      "select=*&active=eq.true&public_visible=eq.true&order=dataset_name.asc"
    );

    return {
      references: rows.map(normalizeSupabaseTideReference).filter(Boolean),
      sourceLabel: "Using Supabase tide_datasets",
      source: "supabase"
    };
  } catch (error) {
    console.warn("Tide reference read failed.", error);
  }

  return {
    references: [],
    sourceLabel: "No Supabase tide references loaded",
    source: "static"
  };
}

function normalizeSupabaseFarmLocation(row) {
  const key = row.farm_location_key || row.location_code || row.id;
  if (!key) return null;

  const latitude = toFiniteNumber(row.latitude);
  const longitude = toFiniteNumber(row.longitude);
  const datasetKey = row.default_tide_dataset_key || "kmfri_2026_mombasa";

  return {
    key,
    id: row.id || null,
    locationCode: row.location_code || "",
    name: row.farm_name || row.short_name || key,
    shortName: row.short_name || row.farm_name || key,
    region: row.region || "",
    country: row.country || "Kenya",
    timezone: "Africa/Nairobi",
    tideProfileKey: DATASET_PROFILE_MAP[datasetKey] || "kenya_mombasa_reference",
    defaultTideDatasetKey: datasetKey,
    defaultHarvestThresholdM: Number(row.default_harvest_threshold_m ?? 0.7),
    gps: Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { lat: latitude, lon: longitude }
      : null,
    gpsLabel: row.gps_notes || "GPS to be confirmed",
    status: row.status || "",
    publicVisible: row.public_visible,
    active: row.active,
    notes: row.notes || "Farm location loaded from Supabase."
  };
}

function normalizeSupabaseTideReference(row) {
  const key = row.dataset_key || row.id;
  if (!key) return null;

  return {
    key,
    name: row.tide_location_name || row.dataset_name || key,
    datasetName: row.dataset_name || key,
    sourceName: row.source_organization || row.source_title || "Tide dataset",
    sourceUrl: row.source_url || "",
    latitude: toFiniteNumber(row.tide_location_latitude),
    longitude: toFiniteNumber(row.tide_location_longitude),
    datumLabel: row.datum_label || "",
    status: row.verification_status || "",
    timezone: row.timezone || "Africa/Nairobi"
  };
}

function canReadSupabase() {
  return APP_CONFIG.supabase.enabled === true || APP_CONFIG.supabase.publicReadsEnabled === true;
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}
