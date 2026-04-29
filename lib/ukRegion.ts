export type UKSubdivision = 'eng' | 'sct' | 'wls' | 'nir';

const WELSH_CITIES = new Set(
  [
    'Cardiff', 'Swansea', 'Newport', 'Wrexham', 'St Asaph', 'St Davids',
    'Bangor', 'Aberystwyth', 'Caernarfon', 'Llandudno', 'Conwy', 'Tenby',
    'Hay-on-Wye', 'Caerphilly', 'Pembroke', 'Snowdonia',
    'Cardigan', 'Carmarthen', 'Barmouth', 'Harlech', 'Rhyl',
    'Llanberis', 'Betws-y-Coed', 'Brecon', 'Monmouth',
  ].map(s => s.toLowerCase())
);

const SCOTTISH_CITIES = new Set(
  [
    'Edinburgh', 'Glasgow', 'Aberdeen', 'Dundee', 'Inverness', 'Stirling',
    'St Andrews', 'Perth', 'Oban', 'Fort William', 'Pitlochry',
    'Dunfermline', 'Falkirk', 'Kirkwall', 'Lerwick', 'Stornoway',
    'Ullapool', 'Skye', 'Portree', 'Tobermory', 'Iona', 'Mull',
    'Aviemore', 'Inverary', 'Dunkeld', 'Melrose', 'Jedburgh', 'Kelso',
    'Ayr', 'Largs', 'Greenock', 'Paisley', 'Dumfries', 'Galashiels',
    'Hawick',
  ].map(s => s.toLowerCase())
);

const NI_CITIES = new Set(
  [
    'Belfast', 'Londonderry', 'Derry', 'Lisburn', 'Newry', 'Armagh',
    'Bangor', 'Antrim', 'Coleraine', 'Portrush', 'Ballymena',
    'Enniskillen', 'Omagh', 'Carrickfergus', 'Newtownabbey', 'Holywood',
  ].map(s => s.toLowerCase())
);

export function ukSubdivision(
  name: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
): UKSubdivision | null {
  if (name) {
    const lower = name.toLowerCase().trim();
    const isWelsh = WELSH_CITIES.has(lower);
    const isScottish = SCOTTISH_CITIES.has(lower);
    const isNI = NI_CITIES.has(lower);

    if (isWelsh && isNI && typeof lat === 'number') {
      return lat > 54 ? 'nir' : 'wls';
    }

    if (isWelsh) return 'wls';
    if (isScottish) return 'sct';
    if (isNI) return 'nir';
  }

  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  if (lat >= 54.0 && lat <= 55.4 && lng >= -8.2 && lng <= -5.4) return 'nir';
  if (lat >= 55.5 && lng >= -8.0 && lng <= -0.7) return 'sct';
  if (lat >= 55.0 && lat < 55.5 && lng >= -6.0 && lng <= -2.5) return 'sct';
  if (lat >= 51.3 && lat <= 53.5 && lng >= -5.5 && lng <= -2.65) return 'wls';

  return 'eng';
}
