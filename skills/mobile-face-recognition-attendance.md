# Mobile Face Recognition Attendance (Expo + Laravel)

Use this guide to recreate the same working setup in other projects.

## Goal

Build staff attendance with strong face verification so a different person cannot time in/out.

## Stack

- Mobile: Expo React Native (`CameraView` + hidden `WebView`)
- Face engine: `face-api.js` in WebView
- Face vector: `face-api` descriptor (128-d, normalized)
- Backend: Laravel API + cosine similarity matching

## Required Backend Tables

- `user_face_templates`
  - `user_id`
  - `embedding` (JSON array)
  - `algorithm` (string)
  - `embedding_dim` (int)
  - `is_active` (bool)
  - timestamps

## Core Rules

1. Staff must have active enrolled face template.
2. Enrollment and attendance must use **strong descriptor**, not weak landmarks.
3. Different faces must fail with `FACE_MISMATCH`.
4. Re-enrollment should be blocked if new face does not match current owner.

## Mobile Implementation

### 1) Hidden WebView Face Engine

- File: `mob/components/FaceDetectionWebView.tsx`
- Render WebView hidden/offscreen to avoid white flash:
  - `opacity: 0`
  - `width/height: 1`
  - move offscreen (`left/top: -2000`)
- Expose method:
  - `detectFromBase64(base64) => { ok, box, landmarks, descriptor }`

### 2) Web HTML (face-api models)

- File: `mob/utils/faceDetectorWebHtml.ts`
- Load all required models:
  - `tinyFaceDetector`
  - `faceLandmark68Net`
  - `faceRecognitionNet`
- Detect with:
  - `detectAllFaces(...).withFaceLandmarks().withFaceDescriptors()`
- Return descriptor array in WebView result payload.

### 3) Attendance Capture Flow

- File: `mob/app/Staff/Attendance.tsx`
- In `captureFaceEmbedding()`:
  - take photo
  - send base64 to WebView
  - require descriptor length `>= 64` for staff actions
  - normalize descriptor before sending to backend
- Use `requireStrong: true` for:
  - Register face
  - Time in
  - Time out
  - Auto submit

### 4) UI/UX Notes

- Avoid clutter overlays.
- Keep scanner visuals minimal (frame + scan line).
- Keep hidden WebView truly invisible.
- Show clear errors:
  - `FACE_NOT_ENROLLED`
  - `FACE_MISMATCH`
  - `FACE_TEMPLATE_WEAK`
  - `FACE_STRONG_EMBEDDING_REQUIRED`
  - `FACE_DIM_MISMATCH`

## Backend Implementation

### 1) Enrollment Controller

- File: `backend/app/Http/Controllers/Api/FaceEnrollmentController.php`
- Use strong config:
  - `MIN_EMBEDDING_LEN = 64`
  - `MAX_EMBEDDING_LEN = 256`
  - `DEFAULT_ALGORITHM = 'faceapi-128-v1'`
- During re-enrollment:
  - if existing active template exists, compare old vs new embedding
  - block update if mismatch (`FACE_REENROLL_MISMATCH`)

### 2) Attendance Controller

- File: `backend/app/Http/Controllers/Api/AttendanceController.php`
- Validation for `face_embedding`:
  - `array|min:64|max:256` for both time-in and time-out
- Staff checks:
  - require active template
  - reject weak old template (`embedding_dim < 64`) with `FACE_TEMPLATE_WEAK`
  - reject dimension mismatch with `FACE_DIM_MISMATCH`
  - compute cosine similarity and compare threshold

### 3) Matcher Service

- File: `backend/app/Services/FaceTemplateMatcher.php`
- Cosine similarity on vectors.
- Default threshold: `0.93` (can tune via `FACE_MATCH_THRESHOLD` env).

## API Error Codes (recommended)

- `FACE_NOT_ENROLLED`
- `FACE_EMBEDDING_REQUIRED`
- `FACE_STRONG_EMBEDDING_REQUIRED`
- `FACE_TEMPLATE_WEAK`
- `FACE_DIM_MISMATCH`
- `FACE_MISMATCH`
- `FACE_REENROLL_MISMATCH`
- `FACE_REENROLL_BLOCKED`

## Quick Test Checklist

1. Enroll face for staff account.
2. Confirm DB row:
   - `algorithm = faceapi-128-v1`
   - `embedding_dim` near 128
   - `is_active = 1`
3. Time in with enrolled owner face -> success.
4. Time in with different person -> must fail `FACE_MISMATCH`.
5. Try re-enrolling with different person -> must fail `FACE_REENROLL_MISMATCH`.

## Debug Tips

- If you get “not registered” but row exists:
  - check `algorithm` and `embedding_dim`
  - old `landmark-v1` row is weak/legacy and may be blocked
- If you get “must not have more than 64 items”:
  - update attendance validation to max `256`
- After backend changes run:
  - `php artisan optimize:clear`

