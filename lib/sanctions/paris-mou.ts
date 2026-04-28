// Paris MoU 2024 flag state classification (static)
// Source: Paris MoU Annual Report 2024

type MouCategory = 'white' | 'grey' | 'black';

const CLASSIFICATIONS: Record<string, MouCategory> = {
  // White list (low detention rate)
  'bahamas': 'white',
  'marshall islands': 'white',
  'cyprus': 'white',
  'malta': 'white',
  'norway': 'white',
  'greece': 'white',
  'panama': 'white',
  'liberia': 'white',
  'hong kong': 'white',
  'singapore': 'white',
  'cayman islands': 'white',
  'bermuda': 'white',
  'isle of man': 'white',
  'antigua and barbuda': 'white',
  'denmark': 'white',
  'germany': 'white',
  'united kingdom': 'white',
  'netherlands': 'white',
  'sweden': 'white',
  'japan': 'white',
  'south korea': 'white',
  'china': 'white',
  'italy': 'white',
  'france': 'white',
  'spain': 'white',
  'portugal': 'white',
  'finland': 'white',
  'bahrain': 'white',
  'barbados': 'white',
  'cook islands': 'white',
  'croatia': 'white',
  'gibraltar': 'white',
  'india': 'white',
  'indonesia': 'white',
  'ireland': 'white',
  'luxembourg': 'white',
  'madeira': 'white',
  'netherlands antilles': 'white',
  'new zealand': 'white',
  'niue': 'white',
  'saudi arabia': 'white',
  'st kitts and nevis': 'white',
  'tuvalu': 'white',
  'united states': 'white',
  'vanuatu': 'white',
  'virgin islands': 'white',

  // Grey list (medium detention rate)
  'togo': 'grey',
  'tanzania': 'grey',
  'cambodia': 'grey',
  'bolivia': 'grey',
  'belize': 'grey',
  'myanmar': 'grey',
  'moldova': 'grey',
  'georgia': 'grey',
  'saint vincent and the grenadines': 'grey',
  'philippines': 'grey',
  'russia': 'grey',
  'ukraine': 'grey',
  'kiribati': 'grey',
  'equatorial guinea': 'grey',
  'gabon': 'grey',
  'guinea': 'grey',

  // Black list (high detention rate)
  'comoros': 'black',
  'palau': 'black',
  'korea, north': 'black',
  'north korea': 'black',
  'iran': 'black',
  'syria': 'black',
  'sierra leone': 'black',
  'sao tome and principe': 'black',
  'saint tome and principe': 'black',
  'djibouti': 'black',
  'dominica': 'black',
  'honduras': 'black',
  'mongolia': 'black',
  'tanzania, united rep': 'black',
};

export function getParisMouClassification(flagCountry: string): MouCategory | 'unknown' {
  if (!flagCountry) return 'unknown';
  const key = flagCountry.toLowerCase().trim();
  return CLASSIFICATIONS[key] ?? 'unknown';
}
