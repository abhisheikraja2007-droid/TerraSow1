import { Waypoint } from '../types';

/**
 * Converts degrees to radians
 */
function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Converts radians to degrees
 */
function rad2deg(rad: number): number {
  return rad * (180 / Math.PI);
}

/**
 * Extremely basic local cartesian projection
 * Earth radius ~6371000m
 */
const R = 6371000;

interface Point2D {
  x: number;
  y: number;
}

function latLngToMeters(lat: number, lng: number, refLat: number, refLng: number): Point2D {
  const dLat = deg2rad(lat - refLat);
  const dLng = deg2rad(lng - refLng);
  const x = dLng * Math.cos(deg2rad(refLat)) * R;
  const y = dLat * R;
  return { x, y };
}

function metersToLatLng(x: number, y: number, refLat: number, refLng: number): { lat: number; lng: number } {
  const dLat = y / R;
  const dLng = x / (R * Math.cos(deg2rad(refLat)));
  return {
    lat: refLat + rad2deg(dLat),
    lng: refLng + rad2deg(dLng),
  };
}

/**
 * Calculates the bounding box of a polygon in 2D
 */
function getBoundingBox(polygon: Point2D[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Ray casting / Line intersection with a polygon
 * Returns all X-intersections for a given Y horizontal sweep line
 */
function getIntersections(y: number, polygon: Point2D[]): number[] {
  const intersections: number[] = [];
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const p1 = polygon[i];
    const p2 = polygon[j];
    
    // Check if the horizontal line at Y intersects the segment p1-p2
    if ((p1.y > y) !== (p2.y > y)) {
      // Calculate intersection X using linear interpolation
      const x = p1.x + ((p2.x - p1.x) * (y - p1.y)) / (p2.y - p1.y);
      intersections.push(x);
    }
  }
  // Sort from left to right
  return intersections.sort((a, b) => a - b);
}

/**
 * Rotates a point around the origin
 */
function rotatePoint(p: Point2D, angleRad: number): Point2D {
  return {
    x: p.x * Math.cos(angleRad) - p.y * Math.sin(angleRad),
    y: p.x * Math.sin(angleRad) + p.y * Math.cos(angleRad),
  };
}

/**
 * Finds the angle of the longest edge of the polygon to optimize driving direction
 */
function getOptimalSweepAngle(polygon: Point2D[]): number {
  let maxDistSq = -1;
  let bestAngle = 0;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const p1 = polygon[i];
    const p2 = polygon[j];
    const distSq = Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2);
    if (distSq > maxDistSq) {
      maxDistSq = distSq;
      // Angle of the edge
      bestAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    }
  }
  
  // We want sweep lines (horizontal in rotated space) to be PARALLEL to the longest edge
  // So we rotate the polygon such that the longest edge is horizontal (angle = 0)
  return -bestAngle;
}

/**
 * Advanced grid generation algorithm that generates a Boustrophedon path 
 * constrained tightly within the user's custom boundary polygon.
 */
export function generateGridInBoundary(
  boundaryPoints: [number, number][],
  swathWidthMeters: number,
  targetDepthCm: number = 4.0,
  targetSpacingCm: number = 18.0
): Waypoint[] {
  if (boundaryPoints.length < 3) return [];

  // 1. Establish reference point (centroid)
  let sumLat = 0, sumLng = 0;
  boundaryPoints.forEach(([lat, lng]) => {
    sumLat += lat;
    sumLng += lng;
  });
  const refLat = sumLat / boundaryPoints.length;
  const refLng = sumLng / boundaryPoints.length;

  // 2. Project boundary to local cartesian meters
  const polyMeters = boundaryPoints.map(([lat, lng]) => latLngToMeters(lat, lng, refLat, refLng));

  // 3. Find optimal sweep angle (longest edge) and rotate polygon to align with X-axis
  const sweepAngle = getOptimalSweepAngle(polyMeters);
  const rotatedPoly = polyMeters.map(p => rotatePoint(p, sweepAngle));

  // 4. Get bounding box of rotated polygon
  const bounds = getBoundingBox(rotatedPoly);

  // 5. Generate Sweep Lines (working from bottom to top in Y)
  // We add a tiny buffer (half swath) so we stay strictly inside the boundary
  let currentY = bounds.minY + (swathWidthMeters / 2);
  const maxY = bounds.maxY - (swathWidthMeters / 2);
  
  const sweepSegments: { start: Point2D, end: Point2D }[] = [];

  while (currentY <= maxY) {
    const intersections = getIntersections(currentY, rotatedPoly);
    // Process pairs of intersections (entry and exit)
    for (let i = 0; i < intersections.length - 1; i += 2) {
      const xStart = intersections[i] + (swathWidthMeters / 2); // Buffer from edge
      const xEnd = intersections[i+1] - (swathWidthMeters / 2); // Buffer from edge
      
      if (xStart < xEnd) { // Valid segment long enough to drive
        sweepSegments.push({
          start: { x: xStart, y: currentY },
          end: { x: xEnd, y: currentY }
        });
      }
    }
    currentY += swathWidthMeters;
  }

  // 6. Connect segments into a continuous Boustrophedon (Lawnmower) Path
  const finalPathRotated: { p: Point2D, isSeeding: boolean }[] = [];
  let leftToRight = true;

  for (const seg of sweepSegments) {
    if (leftToRight) {
      finalPathRotated.push({ p: seg.start, isSeeding: false }); // Navigate to start (Turn)
      finalPathRotated.push({ p: seg.end, isSeeding: true });    // Sow to end
    } else {
      finalPathRotated.push({ p: seg.end, isSeeding: false });   // Navigate to end (Turn)
      finalPathRotated.push({ p: seg.start, isSeeding: true });  // Sow back to start
    }
    leftToRight = !leftToRight;
  }

  // 7. Rotate back and un-project to Lat/Lng waypoints
  const result: Waypoint[] = [];
  let wpIdx = 0;

  for (const point of finalPathRotated) {
    // Un-rotate
    const unrotated = rotatePoint(point.p, -sweepAngle);
    // Un-project
    const ll = metersToLatLng(unrotated.x, unrotated.y, refLat, refLng);

    result.push({
      index: wpIdx++,
      command: 'WAYPOINT',
      lat: ll.lat,
      lng: ll.lng,
      alt: 0,
      param1: 0,
      param2: 1.0,
      param3: 0,
      param4: 0,
      seederActive: point.isSeeding,
      speedKmh: point.isSeeding ? 8.5 : 12.0, // Slower for seeding, faster for turns
      targetDepthCm,
      targetSpacingCm,
    });
  }

  return result;
}
