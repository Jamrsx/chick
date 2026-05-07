import type { FaceLandmarksInput } from './faceEmbedding';

type Pt = { x: number; y: number };

function avgRegion(pts: Pt[], indices: readonly number[]): Pt {
  let x = 0;
  let y = 0;
  for (const i of indices) {
    x += pts[i].x;
    y += pts[i].y;
  }
  const n = indices.length;
  return { x: x / n, y: y / n };
}

/**
 * Builds the same geometric structure as expo-face-detector from 68 face-api landmarks.
 * Indices follow iBUG 68 markup (same as dlib face-api default).
 */
export function landmarks68ToFaceLandmarksInput(
  box: { x: number; y: number; width: number; height: number },
  positions: Pt[]
): FaceLandmarksInput | null {
  if (!positions || positions.length < 68) {
    console.log('[FACE-WEB] expected 68 landmark points');
    return null;
  }

  const le = avgRegion(positions, [36, 37, 38, 39, 40, 41]);
  const re = avgRegion(positions, [42, 43, 44, 45, 46, 47]);
  const noseBase = positions[30];
  const mouth = avgRegion(positions, [60, 61, 62, 63, 64, 65, 66, 67]);
  const lm = positions[48];
  const rm = positions[54];
  const leftCheek = positions[5];
  const rightCheek = positions[11];

  const ipd = Math.hypot(re.x - le.x, re.y - le.y);
  if (ipd < 12) {
    console.log('[FACE-WEB] face too small in frame', ipd);
    return null;
  }

  const rollDeg = ((Math.atan2(re.y - le.y, re.x - le.x) * 180) / Math.PI) || 0;
  const eyeMid = { x: (le.x + re.x) / 2, y: (le.y + re.y) / 2 };
  const yawRaw = (noseBase.x - eyeMid.x) / (ipd * 0.5);
  const yawEstimate = Math.max(-1, Math.min(1, yawRaw)) * 35;

  return {
    bounds: {
      origin: { x: box.x, y: box.y },
      size: { width: box.width, height: box.height },
    },
    leftEyePosition: le,
    rightEyePosition: re,
    noseBasePosition: noseBase,
    mouthPosition: mouth,
    leftCheekPosition: leftCheek,
    rightCheekPosition: rightCheek,
    leftMouthPosition: lm,
    rightMouthPosition: rm,
    yawAngle: yawEstimate,
    rollAngle: rollDeg,
  };
}
