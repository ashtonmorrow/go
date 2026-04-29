import type {
  PinBooking,
  PinCrowdLevel,
  PinDifficulty,
  PinFoodOnSite,
  PinIndoorOutdoor,
  PinParking,
  PinPhotography,
  PinRequiresGuide,
  PinRestrooms,
  PinShade,
  PinStatus,
  PinTimeOfDay,
  PinWheelchair,
} from './pins';

export type Facet = { label: string; icon: string };

export const STATUS_FACET: Record<PinStatus, Facet> = {
  active: { label: 'Open', icon: 'circle-check' },
  closed: { label: 'Permanently closed', icon: 'circle-x' },
  'temporarily-closed': { label: 'Temporarily closed', icon: 'alert-triangle' },
  seasonal: { label: 'Seasonal', icon: 'calendar' },
  unknown: { label: 'Status unknown', icon: 'help-circle' },
};

export const BOOKING_FACET: Record<PinBooking, Facet> = {
  no: { label: 'No booking needed', icon: 'check' },
  recommended: { label: 'Booking recommended', icon: 'calendar-check' },
  required: { label: 'Booking required', icon: 'lock' },
  'timed-entry-only': { label: 'Timed entry only', icon: 'clock' },
};

export const CROWD_FACET: Record<PinCrowdLevel, Facet> = {
  'always-quiet': { label: 'Rarely crowded', icon: 'users' },
  'morning-quiet': { label: 'Quiet in the morning', icon: 'sunrise' },
  'consistently-busy': { label: 'Consistently busy', icon: 'users-2' },
  'seasonal-spikes': { label: 'Crowded in season', icon: 'trending-up' },
  unknown: { label: 'Crowd levels unknown', icon: 'help-circle' },
};

export const FOOD_FACET: Record<PinFoodOnSite, Facet> = {
  none: { label: 'No food on site', icon: 'utensils-crossed' },
  kiosk: { label: 'Kiosk / snacks', icon: 'coffee' },
  cafe: { label: 'Café on site', icon: 'coffee' },
  restaurant: { label: 'Restaurant on site', icon: 'utensils' },
  multiple: { label: 'Multiple food options', icon: 'utensils' },
  unknown: { label: 'Food availability unknown', icon: 'help-circle' },
};

export const RESTROOMS_FACET: Record<PinRestrooms, Facet> = {
  none: { label: 'No restrooms', icon: 'circle-x' },
  basic: { label: 'Basic restrooms', icon: 'door-open' },
  modern: { label: 'Modern restrooms', icon: 'door-open' },
  paid: { label: 'Paid restrooms', icon: 'door-open' },
  unknown: { label: 'Restrooms unknown', icon: 'help-circle' },
};

export const SHADE_FACET: Record<PinShade, Facet> = {
  'fully-shaded': { label: 'Fully shaded', icon: 'umbrella' },
  'partly-shaded': { label: 'Partial shade', icon: 'cloud-sun' },
  'fully-exposed': { label: 'Sun-exposed', icon: 'sun' },
  'covered-indoor': { label: 'Indoor / covered', icon: 'home' },
  unknown: { label: 'Shade unknown', icon: 'help-circle' },
};

export const INDOOR_FACET: Record<PinIndoorOutdoor, Facet> = {
  indoor: { label: 'Indoor', icon: 'home' },
  outdoor: { label: 'Outdoor', icon: 'tree-pine' },
  mixed: { label: 'Indoor + outdoor', icon: 'layers' },
  unknown: { label: 'Setting unknown', icon: 'help-circle' },
};

export const WHEELCHAIR_FACET: Record<PinWheelchair, Facet> = {
  fully: { label: 'Wheelchair accessible', icon: 'accessibility' },
  partially: { label: 'Partially accessible', icon: 'accessibility' },
  no: { label: 'Not wheelchair accessible', icon: 'circle-x' },
  unknown: { label: 'Accessibility unknown', icon: 'help-circle' },
};

export const PHOTOGRAPHY_FACET: Record<PinPhotography, Facet> = {
  allowed: { label: 'Photos allowed', icon: 'camera' },
  'no-flash': { label: 'No flash photography', icon: 'camera-off' },
  'paid-permit': { label: 'Photo permit required', icon: 'receipt' },
  restricted: { label: 'Photos restricted in places', icon: 'camera-off' },
  forbidden: { label: 'No photography', icon: 'camera-off' },
  unknown: { label: 'Photo policy unknown', icon: 'help-circle' },
};

export const DIFFICULTY_FACET: Record<PinDifficulty, Facet> = {
  easy: { label: 'Easy', icon: 'leaf' },
  moderate: { label: 'Moderate', icon: 'mountain' },
  hard: { label: 'Hard', icon: 'mountain-snow' },
  expert: { label: 'Expert', icon: 'flag-triangle-right' },
  unknown: { label: 'Difficulty unknown', icon: 'help-circle' },
};

export const PARKING_FACET: Record<PinParking, Facet> = {
  free: { label: 'Free parking', icon: 'parking-circle' },
  paid: { label: 'Paid parking', icon: 'parking-circle' },
  street: { label: 'Street parking', icon: 'parking-circle' },
  limited: { label: 'Limited parking', icon: 'parking-circle' },
  none: { label: 'No parking', icon: 'circle-x' },
  unknown: { label: 'Parking unknown', icon: 'help-circle' },
};

export const REQUIRES_GUIDE_FACET: Record<PinRequiresGuide, Facet> = {
  no: { label: 'No guide needed', icon: 'check' },
  recommended: { label: 'Guide recommended', icon: 'compass' },
  required: { label: 'Guide required', icon: 'lock' },
  unknown: { label: 'Guide policy unknown', icon: 'help-circle' },
};

export const TIME_OF_DAY_FACET: Record<PinTimeOfDay, Facet> = {
  sunrise: { label: 'Sunrise', icon: 'sunrise' },
  morning: { label: 'Morning', icon: 'sun' },
  midday: { label: 'Midday', icon: 'sun' },
  afternoon: { label: 'Afternoon', icon: 'sun' },
  sunset: { label: 'Sunset', icon: 'sunset' },
  evening: { label: 'Evening', icon: 'moon' },
  night: { label: 'Night', icon: 'moon' },
};

// "What to bring" vocabulary — keep canonical strings short, lowercase, hyphenated.
export const BRING_FACET: Record<string, Facet> = {
  cash: { label: 'Cash', icon: 'banknote' },
  'small-bills': { label: 'Small bills', icon: 'banknote' },
  water: { label: 'Water', icon: 'droplet' },
  food: { label: 'Food / snacks', icon: 'sandwich' },
  sunscreen: { label: 'Sunscreen', icon: 'sun' },
  'warm-layer': { label: 'Warm layer', icon: 'shirt' },
  'sturdy-shoes': { label: 'Sturdy shoes', icon: 'footprints' },
  'modest-attire': { label: 'Modest attire', icon: 'shirt' },
  passport: { label: 'Passport', icon: 'book' },
  permit: { label: 'Permit', icon: 'receipt' },
  swimsuit: { label: 'Swimsuit', icon: 'waves' },
  flashlight: { label: 'Flashlight', icon: 'flashlight' },
  'bug-spray': { label: 'Bug spray', icon: 'bug' },
};

export function bringFacet(key: string): Facet {
  return BRING_FACET[key] ?? { label: key, icon: 'circle-dot' };
}

export const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function monthRange(months: number[]): string {
  if (!months.length) return '';
  const sorted = [...new Set(months)].filter(m => m >= 1 && m <= 12).sort((a, b) => a - b);
  if (sorted.length === 12) return 'Year-round';
  return sorted.map(m => MONTH_LABELS[m - 1]).join(', ');
}
