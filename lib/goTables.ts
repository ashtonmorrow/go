export const GO_CITIES_TABLE = 'go_cities' as const;
export const GO_COUNTRIES_TABLE = 'go_countries' as const;

export type GoGeoTable = typeof GO_CITIES_TABLE | typeof GO_COUNTRIES_TABLE;

