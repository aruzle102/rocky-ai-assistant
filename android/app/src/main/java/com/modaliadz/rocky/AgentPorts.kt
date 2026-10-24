package com.modaliadz.rocky

/**
 * Small ports adapted from JARVIS (Kotlin, original code):
 * - code_helper.py _clean_code: strip whole-content ``` fences.
 * - task_history.py MAX_HISTORY=100: capped task history, oldest dropped.
 */
object CodeCleaner {
    /** Strips ONLY a whole-content fence (first line ```lang, last line ```).
     *  Code that merely contains backticks (e.g. JS template literals) is
     *  returned unchanged. */
    fun clean(code: String): String {
        val t = code.trim()
        if (!t.startsWith("```")) return code
        val lines = t.lines()
        if (lines.size < 2) return code
        if (lines.last().trim() != "```") return code
        return lines.drop(1).dropLast(1).joinToString("\n").trim()
    }
}

class TaskHistory(private val maxSize: Int = 100) {
    private val items = ArrayDeque<TaskStep>()

    fun add(step: TaskStep) {
        items.addLast(step)
        while (items.size > maxSize) items.removeFirst()
    }

    fun all(): List<TaskStep> = items.toList()
    fun size(): Int = items.size
    fun clear() = items.clear()
}
