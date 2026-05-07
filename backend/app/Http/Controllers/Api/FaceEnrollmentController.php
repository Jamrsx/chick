<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\UserFaceTemplate;
use App\Services\FaceTemplateMatcher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class FaceEnrollmentController extends Controller
{
    protected const ALLOWED_ROLES = ['staff'];
    protected const MIN_EMBEDDING_LEN = 64;
    protected const MAX_EMBEDDING_LEN = 256;
    protected const DEFAULT_ALGORITHM = 'faceapi-128-v1';

    public function status(Request $request)
    {
        $user = $request->user();
        $active = UserFaceTemplate::where('user_id', $user->id)
            ->where('is_active', true)
            ->where('algorithm', self::DEFAULT_ALGORITHM)
            ->exists();

        return response()->json([
            'enrolled' => $active,
            'algorithm' => self::DEFAULT_ALGORITHM,
            'requires_enrollment_for_attendance' => in_array(strtolower((string) ($user->role ?? '')), self::ALLOWED_ROLES, true),
        ]);
    }

    public function enroll(Request $request)
    {
        $user = $request->user();

        if (! in_array(strtolower((string) ($user->role ?? '')), self::ALLOWED_ROLES, true)) {
            return response()->json(['message' => 'Only staff accounts can enroll facial attendance.'], 403);
        }

        $validated = $request->validate([
            'embedding' => 'required|array|min:' . self::MIN_EMBEDDING_LEN . '|max:' . self::MAX_EMBEDDING_LEN,
            'embedding.*' => 'numeric',
        ]);

        $embedding = array_map('floatval', $validated['embedding']);
        $dim = count($embedding);

        $existing = UserFaceTemplate::where('user_id', $user->id)
            ->where('is_active', true)
            ->where('algorithm', self::DEFAULT_ALGORITHM)
            ->first();

        if ($existing) {
            if (count($existing->embedding) !== $dim) {
                return response()->json([
                    'message' => 'Existing face template format changed. Contact admin to reset enrollment.',
                    'code' => 'FACE_REENROLL_BLOCKED',
                ], 422);
            }
            $threshold = FaceTemplateMatcher::threshold(max(0.95, FaceTemplateMatcher::threshold()));
            $similarity = FaceTemplateMatcher::cosineSimilarity($existing->embedding, $embedding);
            if ($similarity < $threshold) {
                return response()->json([
                    'message' => 'Face does not match your current enrollment. Re-enroll denied.',
                    'code' => 'FACE_REENROLL_MISMATCH',
                    'similarity' => $similarity,
                    'threshold' => $threshold,
                ], 422);
            }
        }

        DB::beginTransaction();
        try {
            UserFaceTemplate::where('user_id', $user->id)->update(['is_active' => false]);

            $template = UserFaceTemplate::create([
                'user_id' => $user->id,
                'embedding' => $embedding,
                'algorithm' => self::DEFAULT_ALGORITHM,
                'embedding_dim' => $dim,
                'is_active' => true,
            ]);

            DB::commit();

            \Log::info('[FACE ENROLL]', ['user_id' => $user->id, 'dim' => $dim]);

            return response()->json([
                'message' => 'Face template saved.',
                'template_id' => $template->id,
                'algorithm' => $template->algorithm,
            ]);
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'message' => 'Failed to save face template',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function verify(Request $request)
    {
        $user = $request->user();

        if (! in_array(strtolower((string) ($user->role ?? '')), self::ALLOWED_ROLES, true)) {
            return response()->json(['message' => 'Only staff accounts can verify facial attendance.'], 403);
        }

        $validated = $request->validate([
            'embedding' => 'required|array|min:' . self::MIN_EMBEDDING_LEN . '|max:' . self::MAX_EMBEDDING_LEN,
            'embedding.*' => 'numeric',
        ]);

        $template = UserFaceTemplate::where('user_id', $user->id)
            ->where('is_active', true)
            ->where('algorithm', self::DEFAULT_ALGORITHM)
            ->first();

        if (! $template) {
            return response()->json([
                'message' => 'Register your face first.',
                'code' => 'FACE_NOT_ENROLLED',
            ], 422);
        }

        $probe = array_map('floatval', $validated['embedding']);
        if (count($probe) !== count($template->embedding)) {
            return response()->json([
                'message' => 'Face template outdated. Please re-register your face.',
                'code' => 'FACE_DIM_MISMATCH',
            ], 422);
        }

        $threshold = FaceTemplateMatcher::threshold();
        $similarity = FaceTemplateMatcher::cosineSimilarity($template->embedding, $probe);

        return response()->json([
            'match' => $similarity >= $threshold,
            'similarity' => $similarity,
            'threshold' => $threshold,
            'algorithm' => self::DEFAULT_ALGORITHM,
        ]);
    }

    public function reset(Request $request)
    {
        $user = $request->user();

        if (! in_array(strtolower((string) ($user->role ?? '')), self::ALLOWED_ROLES, true)) {
            return response()->json(['message' => 'Only staff accounts can manage facial attendance.'], 403);
        }

        $validated = $request->validate([
            'password' => 'required|string|min:4',
        ]);

        if (! Hash::check($validated['password'], (string) $user->password)) {
            return response()->json([
                'message' => 'Invalid password.',
                'code' => 'FACE_PASSWORD_INVALID',
            ], 422);
        }

        UserFaceTemplate::where('user_id', $user->id)
            ->where('is_active', true)
            ->update(['is_active' => false]);

        \Log::info('[FACE RESET]', ['user_id' => $user->id]);

        return response()->json([
            'message' => 'Face data reset. Register a new face template now.',
            'enrolled' => false,
            'algorithm' => self::DEFAULT_ALGORITHM,
        ]);
    }
}
