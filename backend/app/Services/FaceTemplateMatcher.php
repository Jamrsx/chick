<?php

namespace App\Services;

class FaceTemplateMatcher
{
    /**
     * Cosine similarity in [0, 1] for L2-normalized vectors (approximately).
     */
    public static function cosineSimilarity(array $a, array $b): float
    {
        if (count($a) !== count($b) || count($a) === 0) {
            return 0.0;
        }

        $dot = 0.0;
        $na = 0.0;
        $nb = 0.0;

        foreach ($a as $i => $v) {
            $va = (float) $v;
            $vb = (float) $b[$i];
            $dot += $va * $vb;
            $na += $va * $va;
            $nb += $vb * $vb;
        }

        $denom = sqrt($na) * sqrt($nb);

        return $denom > 0 ? $dot / $denom : 0.0;
    }

    public static function matches(array $stored, array $probe, ?float $threshold = null): bool
    {
        $threshold ??= (float) env('FACE_MATCH_THRESHOLD', 0.93);

        return self::cosineSimilarity($stored, $probe) >= $threshold;
    }

    public static function threshold(?float $threshold = null): float
    {
        return $threshold ?? (float) env('FACE_MATCH_THRESHOLD', 0.93);
    }
}
