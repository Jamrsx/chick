/** Matches expo-face-detector FaceFeature landmarks we use (no runtime import). */
export type FaceLandmarksInput = {
  bounds: { origin: { x: number; y: number }; size: { width: number; height: number } };
  leftEyePosition?: { x: number; y: number };
  rightEyePosition?: { x: number; y: number };
  noseBasePosition?: { x: number; y: number };
  mouthPosition?: { x: number; y: number };
  leftCheekPosition?: { x: number; y: number };
  rightCheekPosition?: { x: number; y: number };
  leftMouthPosition?: { x: number; y: number };
  rightMouthPosition?: { x: number; y: number };
  yawAngle?: number;
  rollAngle?: number;
};

function l2Normalize(v: number[]): number[] {
  const s = Math.sqrt(v.reduce((acc, x) => acc + x * x, 0)) || 1;
  return v.map((x) => x / s);
}

export function normalizeEmbedding(v: number[]): number[] {
  return l2Normalize(v);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Landmark-based embedding (paired with Laravel `FaceTemplateMatcher` + `landmark-v1`).
 * expo-face-detector does not expose deep embeddings; this is geometry-only (dev build required).
 */
export function buildLandmarkEmbedding(face: FaceLandmarksInput): number[] | null {
  const le = face.leftEyePosition;
  const re = face.rightEyePosition;
  const nose = face.noseBasePosition;
  const mouth = face.mouthPosition;
  const b = face.bounds;

  if (!le || !re || !nose || !mouth || !b) {
    console.log('[FACE] Missing landmarks for embedding');
    return null;
  }

  const ipd = Math.hypot(re.x - le.x, re.y - le.y);
  if (ipd < 8) {
    console.log('[FACE] Interpupillary distance too small', ipd);
    return null;
  }

  const d = (a: { x: number; y: number }, c: { x: number; y: number }) =>
    Math.hypot(c.x - a.x, c.y - a.y) / ipd;
  const dx = (a: { x: number; y: number }, c: { x: number; y: number }) => (c.x - a.x) / ipd;
  const dy = (a: { x: number; y: number }, c: { x: number; y: number }) => (c.y - a.y) / ipd;

  const yaw = typeof face.yawAngle === 'number' ? face.yawAngle : 0;
  const roll = typeof face.rollAngle === 'number' ? face.rollAngle : 0;

  const lc = face.leftCheekPosition;
  const rc = face.rightCheekPosition;
  const lm = face.leftMouthPosition;
  const rm = face.rightMouthPosition;

  const pts: Array<{ key: string; p?: { x: number; y: number } }> = [
    { key: 'le', p: le },
    { key: 're', p: re },
    { key: 'nose', p: nose },
    { key: 'mouth', p: mouth },
    { key: 'lc', p: lc },
    { key: 'rc', p: rc },
    { key: 'lm', p: lm },
    { key: 'rm', p: rm },
  ];

  // Signed geometry relative to nose (adds discriminative power vs pure distances).
  const vec: number[] = [];
  for (const item of pts) {
    const p = item.p;
    if (!p) {
      vec.push(0, 0);
      continue;
    }
    vec.push(clamp(dx(nose, p), -2, 2), clamp(dy(nose, p), -2, 2));
  }

  // Pairwise normalized distances between all landmark points (stable order).
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i].p;
      const c = pts[j].p;
      if (!a || !c) {
        vec.push(0);
        continue;
      }
      vec.push(clamp(d(a, c), 0, 4));
    }
  }

  // Face box ratios + pose (keep small influence).
  vec.push(clamp(b.size.width / ipd, 0, 8));
  vec.push(clamp(b.size.height / ipd, 0, 10));
  vec.push(clamp(yaw / 45, -1.5, 1.5));
  vec.push(clamp(roll / 45, -1.5, 1.5));

  console.log('[FACE] Embedding dim=', vec.length);

  return l2Normalize(vec);
}
