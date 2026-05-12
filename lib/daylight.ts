// === Daylight calculator ===================================================
// Pure math: sunrise, sunset, and daylight hours for any lat/lng on any
// day of the year. Implements the NOAA Solar Position Algorithm
// (https://gml.noaa.gov/grad/solcalc/calcdetails.html), accurate to
// within a minute at most latitudes.
//
// No external API, no caching — pure compute. Each call is microseconds.
//
const DEG = Math.PI / 180;

export type DaylightDay = {
  /** Sunrise time, hours past UTC midnight (e.g., 5.5 = 05:30 UTC). */
  sunriseUtc: number;
  /** Sunset time, hours past UTC midnight. */
  sunsetUtc: number;
  /** Daylight duration in hours. 0 in polar night, 24 in polar day. */
  daylightHours: number;
  /** True when the sun never rises (polar night). */
  isPolarNight: boolean;
  /** True when the sun never sets (polar day). */
  isPolarDay: boolean;
};

// Mid-month day-of-year (15th of each month, non-leap calendar).
const MONTH_MID_DAYS = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];

/**
 * Compute sunrise, sunset, and daylight hours for a single day.
 *
 * @param lat Latitude in decimal degrees (positive north).
 * @param lng Longitude in decimal degrees (positive east).
 * @param dayOfYear 1–365 (or 366 for leap years).
 */
export function computeDaylight(lat: number, lng: number, dayOfYear: number): DaylightDay {
  // Fractional year angle, radians.
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1);

  // Equation of time, minutes (NOAA formula).
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  // Solar declination, radians.
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const latRad = lat * DEG;
  // Hour angle (cos) at sunrise/sunset using the standard 90.833° solar
  // zenith (90° plus 0.833° for atmospheric refraction + solar disc).
  const cosH =
    Math.cos(90.833 * DEG) / (Math.cos(latRad) * Math.cos(decl)) -
    Math.tan(latRad) * Math.tan(decl);

  if (cosH > 1) {
    // Sun never rises today.
    return { sunriseUtc: 0, sunsetUtc: 0, daylightHours: 0, isPolarNight: true, isPolarDay: false };
  }
  if (cosH < -1) {
    // Sun never sets today.
    return { sunriseUtc: 0, sunsetUtc: 24, daylightHours: 24, isPolarNight: false, isPolarDay: true };
  }

  const H = Math.acos(cosH) / DEG; // degrees
  const solarNoonUtc = 12 - eqTime / 60 - lng / 15;
  const sunriseUtc = (solarNoonUtc - H / 15 + 24) % 24;
  const sunsetUtc = (solarNoonUtc + H / 15 + 24) % 24;
  const daylightHours = (H * 2) / 15;

  return {
    sunriseUtc,
    sunsetUtc,
    daylightHours,
    isPolarNight: false,
    isPolarDay: false,
  };
}

/**
 * Compute daylight for the 15th of each month. Returns 12 entries in
 * calendar order (Jan = index 0).
 */
export function computeMonthlyDaylight(lat: number, lng: number): DaylightDay[] {
  return MONTH_MID_DAYS.map(d => computeDaylight(lat, lng, d));
}

/** Today's day-of-year (1-based, server's local calendar). */
export function todayDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}
