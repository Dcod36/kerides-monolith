export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function isWithinRadius(
  centerLat: number,
  centerLon: number,
  pointLat: number,
  pointLon: number,
  radiusKm: number,
): boolean {
  const distance = calculateDistance(centerLat, centerLon, pointLat, pointLon);
  return distance <= radiusKm;
}

export function findNearbyPoints<T extends { lat?: number; lon?: number; latitude?: number; longitude?: number }>(
  centerLat: number,
  centerLon: number,
  points: T[],
  radiusKm: number,
): (T & { distance: number })[] {
  return points
    .map((point) => {
      const lat = point.lat ?? point.latitude;
      const lon = point.lon ?? point.longitude;

      if (lat === undefined || lon === undefined) {
        return null;
      }

      const distance = calculateDistance(centerLat, centerLon, lat, lon);
      return { ...point, distance };
    })
    .filter((point): point is T & { distance: number } => point !== null && point.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance);
}

export function estimateTravelTime(distanceKm: number, avgSpeedKmh: number = 30): number {
  return Math.ceil((distanceKm / avgSpeedKmh) * 60);
}

export function isValidCoordinates(lat: number, lon: number): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}
