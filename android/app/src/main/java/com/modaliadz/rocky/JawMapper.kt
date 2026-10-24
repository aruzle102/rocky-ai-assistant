package com.modaliadz.rocky

import kotlin.math.abs
import kotlin.math.sin

/**
 * Word/syllable-synchronised jaw mapping.
 * HONEST LIMIT: Android TTS gives word ranges (onRangeStart), not phonemes,
 * so this is word/syllable synchronisation, NOT phoneme-perfect lip-sync.
 * Pure function, unit-tested.
 */
object JawMapper {
    /** Jaw opening 0..1 for a word of [wordLength] characters. Longer words open wider. */
    fun jawForWord(wordLength: Int): Float {
        val v = 0.35f + (wordLength.coerceIn(1, 12) * 0.05f)
        return v.coerceIn(0f, 1f)
    }

    /** Syllable-like envelope while speaking: pulses during speech, 0 after the end. */
    fun envelope(elapsedMs: Long, estimatedDurationMs: Long, wordCount: Int): Float {
        if (estimatedDurationMs <= 0 || elapsedMs >= estimatedDurationMs) return 0f
        if (elapsedMs < 0) return 0f
        val p = elapsedMs.toDouble() / estimatedDurationMs
        val pulse = abs(sin(p * Math.PI * (wordCount.coerceAtLeast(1)) * 0.9))
        val fade = 1.0 - p * 0.25
        return (0.30 + 0.55 * pulse * fade).toFloat().coerceIn(0f, 1f)
    }
}
