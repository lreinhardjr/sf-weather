/**
 * Major continental-US cities compared against San Francisco.
 * Coordinates are approximate city centres (decimal degrees).
 * Alaska and Hawaii are deliberately excluded (continental US only).
 *
 * To adjust the comparison set, add or remove entries here — nothing else needs to change.
 * Keep `SAN_FRANCISCO.name` exactly matching the San Francisco entry below.
 */
const SAN_FRANCISCO = { name: 'San Francisco', lat: 37.7749, lon: -122.4194 };

const CITIES = [
  SAN_FRANCISCO,
  { name: 'Phoenix',             lat: 33.4484, lon: -112.0740 },
  { name: 'Las Vegas',           lat: 36.1699, lon: -115.1398 },
  { name: 'Los Angeles',         lat: 34.0522, lon: -118.2437 },
  { name: 'San Diego',           lat: 32.7157, lon: -117.1611 },
  { name: 'Sacramento',          lat: 38.5816, lon: -121.4944 },
  { name: 'Portland',            lat: 45.5152, lon: -122.6784 },
  { name: 'Seattle',             lat: 47.6062, lon: -122.3321 },
  { name: 'Denver',              lat: 39.7392, lon: -104.9903 },
  { name: 'Salt Lake City',      lat: 40.7608, lon: -111.8910 },
  { name: 'Dallas',              lat: 32.7767, lon:  -96.7970 },
  { name: 'Houston',             lat: 29.7604, lon:  -95.3698 },
  { name: 'Austin',              lat: 30.2672, lon:  -97.7431 },
  { name: 'San Antonio',         lat: 29.4241, lon:  -98.4936 },
  { name: 'Oklahoma City',       lat: 35.4676, lon:  -97.5164 },
  { name: 'Kansas City',         lat: 39.0997, lon:  -94.5786 },
  { name: 'Minneapolis',         lat: 44.9778, lon:  -93.2650 },
  { name: 'Fargo',               lat: 46.8772, lon:  -96.7898 },
  { name: 'Chicago',             lat: 41.8781, lon:  -87.6298 },
  { name: 'Detroit',             lat: 42.3314, lon:  -83.0458 },
  { name: 'Indianapolis',        lat: 39.7684, lon:  -86.1581 },
  { name: 'Nashville',           lat: 36.1627, lon:  -86.7816 },
  { name: 'Atlanta',             lat: 33.7490, lon:  -84.3880 },
  { name: 'Miami',               lat: 25.7617, lon:  -80.1918 },
  { name: 'Orlando',             lat: 28.5383, lon:  -81.3792 },
  { name: 'Charlotte',           lat: 35.2271, lon:  -80.8431 },
  { name: 'New Orleans',         lat: 29.9511, lon:  -90.0715 },
  { name: 'St. Louis',           lat: 38.6270, lon:  -90.1994 },
  { name: 'Boston',              lat: 42.3601, lon:  -71.0589 },
  { name: 'New York',            lat: 40.7128, lon:  -74.0060 },
  { name: 'Philadelphia',        lat: 39.9526, lon:  -75.1652 },
  { name: 'Washington DC',       lat: 38.9072, lon:  -77.0369 },
  { name: 'Pittsburgh',          lat: 40.4406, lon:  -79.9959 },
  { name: 'Buffalo',             lat: 42.8864, lon:  -78.8784 },
  { name: 'Caribou',             lat: 46.8606, lon:  -68.0120 },
  { name: 'International Falls', lat: 48.6011, lon:  -93.4108 },
  { name: 'Bismarck',            lat: 46.8083, lon: -100.7837 },
  { name: 'Great Falls',         lat: 47.5053, lon: -111.3008 },
  { name: 'Duluth',              lat: 46.7867, lon:  -92.1005 },
  { name: 'El Paso',             lat: 31.7619, lon: -106.4850 },
  { name: 'Albuquerque',         lat: 35.0844, lon: -106.6504 },
];

module.exports = { CITIES, SAN_FRANCISCO };
