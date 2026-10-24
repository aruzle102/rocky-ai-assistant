package com.modaliadz.rocky

/**
 * Minimal JSON string reader (no regex, no backtracking, no recursion):
 * reads one JSON string starting at or after [from], skipping whitespace.
 * Returns the decoded value and the index just past the closing quote.
 * Used by the tool-call parser and the capped-memory loader so that
 * multi-KB model content (HTML/CSS/JS full of quotes) cannot blow the
 * stack the way a backtracking regex extraction can.
 */
object JsonStrings {
    fun readString(s: String, from: Int): Pair<String, Int>? {
        var p = from
        while (p < s.length && s[p].isWhitespace()) p++
        if (p >= s.length || s[p] != '"') return null
        p++
        val sb = StringBuilder()
        while (p < s.length) {
            val c = s[p]
            if (c == '\\' && p + 1 < s.length) {
                val e = s[p + 1]
                if (e == 'u' && p + 5 < s.length) {
                    val code = s.substring(p + 2, p + 6).toIntOrNull(16)
                    if (code != null) sb.append(code.toChar())
                    p += 6
                } else {
                    when (e) {
                        'n' -> sb.append('\n'); 't' -> sb.append('\t'); 'r' -> sb.append('\r')
                        '"' -> sb.append('"'); '\\' -> sb.append('\\'); '/' -> sb.append('/')
                        else -> sb.append(e)
                    }
                    p += 2
                }
            } else if (c == '"') {
                return sb.toString() to (p + 1)
            } else {
                sb.append(c); p++
            }
        }
        return null
    }
}

/**
 * JARVIS-adapted agent discipline (architecture inspired by
 * MAL19INDUSTRIES/JARVIS-OS-V.2 agent/planner.py, agent/error_handler.py,
 * memory/memory_manager.py — Kotlin code is original, no Jarvis code copied).
 *
 * 1. Planner discipline: a plan may use ONLY listed tools, is capped at
 *    max steps, prefers fewer steps (duplicates removed), and never writes
 *    an empty file first (research-then-write: a create_file with blank
 *    content is rejected, not executed).
 * 2. Error recovery vocabulary (exact): RETRY / SKIP / REPLAN / ABORT,
 *    each with a reason, a fix suggestion and a short user message.
 *    Max retries 1-2 (2 attempts total per tool in ROCKY).
 */
enum class RecoveryDecision { RETRY, SKIP, REPLAN, ABORT }

data class Recovery(
    val decision: RecoveryDecision,
    val reason: String,
    val fixSuggestion: String,
    val userMessage: String
)

object AgentErrorHandler {
    fun decide(error: String, attempt: Int, maxAttempts: Int = 2): Recovery {
        val e = error.lowercase()
        val transient = listOf("timeout", "timed out", "network", "connection", "500", "502", "503", "rate limit", "try again")
        if (transient.any { e.contains(it) }) {
            return if (attempt < maxAttempts) Recovery(
                RecoveryDecision.RETRY, "Transient error on attempt $attempt: $error",
                "Retry the same tool once; if it fails again, stop and report.",
                "That step hit a temporary error — retrying."
            ) else Recovery(
                RecoveryDecision.ABORT, "Transient error persisted after $maxAttempts attempts: $error",
                "Stop and report the exact error; do not loop forever.",
                "Stopping the task — the error did not clear after retrying."
            )
        }
        if (e.contains("unsupported") || e.contains("confirmation") || e.contains("not found")) {
            return Recovery(
                RecoveryDecision.SKIP, "Step cannot run as requested: $error",
                "Continue the plan without this step and say so in the report.",
                "Skipping a step that cannot run here."
            )
        }
        if (e.contains("validation") || e.contains("unbalanced") || e.contains("missing") || e.contains("empty")) {
            return Recovery(
                RecoveryDecision.REPLAN, "Output failed validation: $error",
                "Apply the deterministic fix and re-validate once, then report the final status.",
                "The result failed validation — repairing it."
            )
        }
        return Recovery(
            RecoveryDecision.ABORT, "Unrecoverable error: $error",
            "Stop the plan and report the exact error; never mark it done.",
            "Stopping the task and reporting the exact error."
        )
    }
}

data class ValidatedPlan(
    val steps: List<Pair<String, Map<String, String>>>,
    val skipped: List<String>
)

object AgentPlanner {
    fun validatePlan(
        plan: List<Pair<String, Map<String, String>>>,
        knownTools: Set<String>,
        maxSteps: Int
    ): ValidatedPlan {
        val steps = mutableListOf<Pair<String, Map<String, String>>>()
        val skipped = mutableListOf<String>()
        val seen = mutableSetOf<String>()
        for ((tool, args) in plan) {
            when {
                tool !in knownTools -> skipped.add("Skipped unknown tool '$tool' — plans may use only listed tools.")
                steps.size >= maxSteps -> skipped.add("Skipped '$tool' — plan exceeds the $maxSteps-step cap; prefer fewer steps.")
                tool == "create_file" && (args["content"] ?: "").isBlank() ->
                    skipped.add("Skipped empty create_file for '${args["filename"]}' — never write an empty file first.")
                tool == "edit_file" && (args["old"] ?: "").isBlank() ->
                    skipped.add("Skipped edit_file for '${args["filename"]}' — no old text given.")
                else -> {
                    val sig = tool + "|" + (args["slug"] ?: "") + "|" + (args["filename"] ?: "")
                    if (sig in seen) {
                        skipped.add("Skipped duplicate '$tool' for '${args["filename"]}' — prefer fewer steps.")
                    } else {
                        seen.add(sig)
                        steps.add(tool to args)
                    }
                }
            }
        }
        return ValidatedPlan(steps, skipped)
    }
}

/**
 * Capped categorized memory (JARVIS memory_manager.py pattern, adapted):
 * categories identity / preferences / projects / relationships / wishes /
 * notes; 380 chars per value, 2200 total. Oldest entries are dropped when
 * the total cap is exceeded. Pure Kotlin, unit-tested.
 */
data class MemoryEntry(val category: String, val key: String, val value: String)

class CappedMemory {
    companion object {
        const val MAX_VALUE_CHARS = 380
        const val MAX_TOTAL_CHARS = 2200
        val CATEGORIES = setOf("identity", "preferences", "projects", "relationships", "wishes", "notes")
    }

    private val entries = LinkedHashMap<String, MemoryEntry>()

    fun put(category: String, key: String, value: String): Boolean {
        if (category !in CATEGORIES) return false
        val v = value.take(MAX_VALUE_CHARS)
        entries["$category:$key"] = MemoryEntry(category, key, v)
        while (totalChars() > MAX_TOTAL_CHARS && entries.isNotEmpty()) {
            entries.remove(entries.keys.first())
        }
        return true
    }

    fun get(category: String, key: String): String? = entries["$category:$key"]?.value
    fun all(): List<MemoryEntry> = entries.values.toList()
    fun totalChars(): Int = entries.values.sumOf { it.value.length }
    fun clear() = entries.clear()

    fun toJson(): String {
        val sb = StringBuilder("[")
        for ((i, e) in entries.values.withIndex()) {
            if (i > 0) sb.append(",")
            sb.append("{\"category\":\"${esc(e.category)}\",\"key\":\"${esc(e.key)}\",\"value\":\"${esc(e.value)}\"}")
        }
        return sb.append("]").toString()
    }

    fun fromJson(json: String) {
        // Cursor parser (no regex) — same stack-safety reason as JsonStrings.
        entries.clear()
        var p = 0
        while (p < json.length) {
            val open = json.indexOf('{', p)
            if (open < 0) break
            p = open + 1
            var category = ""; var key = ""; var value = ""
            while (p < json.length) {
                val (k, afterK) = JsonStrings.readString(json, p) ?: break
                p = afterK
                while (p < json.length && json[p].isWhitespace()) p++
                if (p < json.length && json[p] == ':') p++ else break
                val (v, afterV) = JsonStrings.readString(json, p) ?: break
                p = afterV
                when (k) { "category" -> category = v; "key" -> key = v; "value" -> value = v }
                while (p < json.length && json[p].isWhitespace()) p++
                if (p < json.length && json[p] == ',') { p++; continue }
                break
            }
            if (category.isNotBlank() && key.isNotBlank()) put(category, key, value)
            val close = json.indexOf('}', p)
            p = if (close < 0) json.length else close + 1
        }
    }

    private fun esc(s: String): String = s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")
}
