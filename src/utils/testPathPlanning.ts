import { generateGridInBoundary } from './pathPlanning';

// small polygon ~1.1 meters
const boundaryPoints: [number, number][] = [
  [31.52000, 75.90600],
  [31.52001, 75.90600],
  [31.52001, 75.90601],
  [31.52000, 75.90601],
];

const result = generateGridInBoundary(boundaryPoints, 2.4, 4.0, 18.0);
console.log(`Generated ${result.length} waypoints.`);
