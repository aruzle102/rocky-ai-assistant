package com.modaliadz.rocky

/**
 * Viseme shapes for mouth animation. Android TTS gives word ranges, not
 * phonemes, and Piper gives audio samples, not phonemes — so visemes here
 * are derived from the TEXT (grapheme mapping) and timed by word boundaries
 * (system TTS) or by audio duration (Piper). This is viseme-timed mouth
 * animation, honestly disclosed, not phoneme-perfect lip-sync from an
 * audio phoneme stream (no such stream exists on either engine).
 */
enum class Viseme { NEUTRAL, A, E, I, O, U, M, F }

object VisemeMapper {
    fun forChar(c: Char): Viseme = when (c.lowercaseChar()) {
        'a', 'à', 'á', 'â', 'ä', 'ã', 'å', 'æ', 'ا', 'آ' -> Viseme.A
        'e', 'è', 'é', 'ê', 'ë', 'ə' -> Viseme.E
        'i', 'ì', 'í', 'î', 'ï', 'y', 'ي', 'ى' -> Viseme.I
        'o', 'ò', 'ó', 'ô', 'ö', 'õ', 'œ' -> Viseme.O
        'u', 'ù', 'ú', 'û', 'ü', 'w', 'و', 'ؤ' -> Viseme.U
        'm', 'b', 'p', 'م' -> Viseme.M
        'f', 'v', 'ف' -> Viseme.F
        else -> Viseme.NEUTRAL
    }

    /** One viseme per vowel/consonant group of the word; never empty. */
    fun forWord(word: String): List<Viseme> {
        val out = mutableListOf<Viseme>()
        var last: Viseme? = null
        for (c in word) {
            if (!c.isLetter()) continue
            val v = forChar(c)
            if (v != Viseme.NEUTRAL && v != last) out.add(v)
            last = v
        }
        if (out.isEmpty()) out.add(Viseme.NEUTRAL)
        return out
    }

    /** Viseme sequence for a whole utterance, word by word. */
    fun forText(text: String): List<Viseme> {
        val out = mutableListOf<Viseme>()
        for (word in text.split(Regex("\\s+"))) {
            if (word.isBlank()) continue
            out.addAll(forWord(word))
            out.add(Viseme.NEUTRAL)
        }
        if (out.isEmpty()) out.add(Viseme.NEUTRAL)
        return out
    }
}
