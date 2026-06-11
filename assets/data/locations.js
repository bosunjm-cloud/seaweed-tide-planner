export const TIDE_LOCATIONS = [
  {
    key: "kenya-coast-reference",
    name: "Kenya Coast Reference",
    shortName: "Kenya Coast",
    region: "Southeast Kenya",
    country: "Kenya",
    timezone: "Africa/Nairobi",
    tideProfileKey: "kenya_mombasa_reference",
    defaultHarvestThresholdM: 0.7,
    gps: null,
    gpsLabel: "Farm GPS location to be confirmed",
    status: "prototype_reference",
    notes: "Uses the Mombasa/Kenya coast reference profile until farm-specific calibration is available."
  },
  {
    key: "funzi-placeholder",
    name: "Funzi Farm Area",
    shortName: "Funzi",
    region: "Kwale County",
    country: "Kenya",
    timezone: "Africa/Nairobi",
    tideProfileKey: "kenya_mombasa_reference",
    defaultHarvestThresholdM: 0.7,
    gps: {
      lat: -4.581417,
      lon: 39.437528
    },
    gpsLabel: "4 deg 34 min 53.1 sec S, 39 deg 26 min 15.1 sec E",
    status: "prototype_placeholder",
    notes: "Farm GPS supplied 2026-06-11. Tide timing currently follows the Mombasa/Kenya coast reference profile."
  },
  {
    key: "shangani-placeholder",
    name: "Shangani Farm Area",
    shortName: "Shangani",
    region: "Kwale County",
    country: "Kenya",
    timezone: "Africa/Nairobi",
    tideProfileKey: "kenya_mombasa_reference",
    defaultHarvestThresholdM: 0.7,
    gps: {
      lat: -4.452111,
      lon: 39.497472
    },
    gpsLabel: "4 deg 27 min 07.6 sec S, 39 deg 29 min 50.9 sec E",
    status: "prototype_placeholder",
    notes: "Farm GPS supplied 2026-06-11. Tide timing currently follows the Mombasa/Kenya coast reference profile."
  },
  {
    key: "shimoni-placeholder",
    name: "Shimoni Farm Area",
    shortName: "Shimoni",
    region: "Kwale County",
    country: "Kenya",
    timezone: "Africa/Nairobi",
    tideProfileKey: "kenya_mombasa_reference",
    defaultHarvestThresholdM: 0.7,
    gps: null,
    gpsLabel: "GPS to be confirmed by local operator",
    status: "prototype_placeholder",
    notes: "Placeholder farm-location record. Tide timing currently follows the Mombasa/Kenya coast reference profile."
  },
  {
    key: "fremantle-reference",
    name: "Fremantle Reference",
    shortName: "Fremantle",
    region: "Western Australia",
    country: "Australia",
    timezone: "Australia/Perth",
    tideProfileKey: "fremantle_reference",
    defaultHarvestThresholdM: 0.5,
    gps: null,
    gpsLabel: "Reference only",
    status: "reference_only",
    notes: "Reference profile from the original Seaweed Station dashboard tide implementation."
  }
];
