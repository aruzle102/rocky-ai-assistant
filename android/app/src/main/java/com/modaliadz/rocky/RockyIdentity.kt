package com.modaliadz.rocky

import java.net.URLEncoder

/**
 * ROCKY's identity, defined once and used by EVERY provider path.
 *
 * Root cause fixed in v5: v4 sent this system prompt only to keyed
 * providers. The default keyless provider (Pollinations) received the raw
 * user prompt with no identity at all, so "What is your name?" was answered
 * with the underlying model's brand. Every path now carries the identity.
 *
 * The model may disclose that it runs on an AI model when directly asked
 * about that, but it must never present the underlying model's brand as
 * its own name: its name is ROCKY.
 */
object RockyIdentity {
    const val NAME = "ROCKY"

    const val SYSTEM_PROMPT =
        "You are ROCKY, the user's personal AI assistant. Your name is ROCKY. " +
            "If you are asked your name, who you are, or what you are called, answer ROCKY. " +
            "You run on an AI model, and you may say so if directly asked about the underlying model, " +
            "but never present the underlying model's brand or product name as your own identity. " +
            "Be calm, confident, and concise when appropriate. Be context-aware: use the conversation " +
            "history and the user-controlled memory provided. Explain what you are doing and what you " +
            "will do next, and say plainly what you cannot do. " +
            "Routing: answer directly when you know it; use research only when the user asks or the " +
            "answer needs current data. Confirm before any sensitive action (delete, share, send). " +
            "Report task results briefly (1-2 sentences) plus the details. Respond in the user's language. " +
            "Only remember critical preferences the user states. Never claim a capability you do not have, " +
            "and never claim an action you did not perform."

    /** Full prompt for keyed chat-completions providers: system + history + user. */
    fun chatMessages(history: List<ChatMessage>, memoryText: String, userText: String): String {
        val sb = StringBuilder()
        sb.append("{\"role\":\"system\",\"content\":\"").append(JsonMini.escape(SYSTEM_PROMPT)).append("\"}")
        if (memoryText.isNotBlank()) {
            sb.append(",{\"role\":\"system\",\"content\":\"User-controlled memory:\\n")
                .append(JsonMini.escape(memoryText)).append("\"}")
        }
        for (m in history.takeLast(10)) {
            sb.append(",{\"role\":\"").append(if (m.role == "rocky") "assistant" else "user")
                .append("\",\"content\":\"").append(JsonMini.escape(m.text)).append("\"}")
        }
        sb.append(",{\"role\":\"user\",\"content\":\"").append(JsonMini.escape(userText)).append("\"}")
        return sb.toString()
    }

    /**
     * Full prompt for the keyless Pollinations GET endpoint, which takes no
     * system role: the identity, memory and history are part of the text,
     * URL-encoded (v4 only replaced spaces, breaking punctuation and
     * non-Latin text). Kept short enough for a GET URL.
     */
    fun pollinationsPrompt(history: List<ChatMessage>, memoryText: String, userText: String): String {
        val sb = StringBuilder()
        sb.append(SYSTEM_PROMPT).append("\n")
        if (memoryText.isNotBlank()) sb.append("User-controlled memory:\n").append(memoryText).append("\n")
        for (m in history.takeLast(6)) {
            sb.append(if (m.role == "rocky") "ROCKY: " else "User: ").append(m.text).append("\n")
        }
        sb.append("User: ").append(userText)
        val full = sb.toString()
        val capped = if (full.length > 1800) {
            SYSTEM_PROMPT + "\nUser: " + userText.take(600)
        } else full
        return URLEncoder.encode(capped, "UTF-8")
    }

    /** True when the reply text is predominantly Latin-script (English/French) rather than Arabic. */
    fun isEnglishDominant(text: String): Boolean {
        if (text.isBlank()) return false
        var latin = 0
        var arabic = 0
        for (c in text) {
            when (c) {
                in 'a'..'z', in 'A'..'Z' -> latin++
                in '\u0600'..'\u06FF' -> arabic++
            }
        }
        return latin > 0 && latin >= arabic * 2
    }
}

/**
 * System-TTS male-voice preference. Android's Voice API exposes no gender
 * field, so selection is by voice name markers (Google TTS names its male
 * voices e.g. "en-us-x-sfg#male_1-local"). Returns null when no male voice
 * is present, so the caller keeps the default instead of guessing.
 */
object VoicePick {
    private val maleMarkers = listOf("male", "masculine", "homme", "masculin")

    fun pickMaleVoice(voiceNames: List<String>): String? {
        if (voiceNames.isEmpty()) return null
        // Prefer an explicit male voice for the requested language first is
        // handled by the caller filtering by locale; here prefer any male
        // marker, preferring names that also mention the locale is not
        // possible from names alone, so take the first male-marked voice.
        return voiceNames.firstOrNull { name ->
            maleMarkers.any { marker -> name.lowercase().contains(marker) }
        }
    }
}
