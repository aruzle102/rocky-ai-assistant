package com.modaliadz.rocky

import java.util.concurrent.atomic.AtomicBoolean

/**
 * AUTONOMOUS AGENT RUNTIME — Understand → Plan → Execute tools → Inspect →
 * Fix errors → Verify → Present. Bounded: max 8 iterations, 120 s total,
 * max 2 attempts per tool, cancellable. UI progress mirrors ACTUAL tool
 * steps only — no fake progress.
 *
 * Model tool protocol: the model is asked to reply with a STRICT JSON array
 * of tool calls, e.g. [{"tool":"create_file","args":{"slug":"restaurant",
 * "filename":"index.html","content":"..."}}]. Free keyless models do NOT
 * support native function calling, so this JSON protocol is the honest
 * fallback; providers that DO support native tools (Gemini / OpenRouter
 * tool-capable models) may use their native format in future, but v4 uses
 * the JSON protocol for every provider and documents that.
 */
enum class AgentStepStatus { PROPOSED, RUNNING, DONE, FAILED }

data class AgentStep(
    val tool: String,
    val args: Map<String, String>,
    var status: AgentStepStatus = AgentStepStatus.PROPOSED,
    var output: String = "",
    var durationMs: Long = 0L
)

data class AgentResult(
    val steps: List<AgentStep>,
    val success: Boolean,
    val message: String,
    val projectSlug: String?,
    val generatedByModel: Boolean
)

interface ModelClient {
    /** Returns the model's raw reply text (expected: JSON tool-call array). */
    fun generate(prompt: String): String
}

object ToolCallParser {
    /** Parse a JSON array of {"tool": "...", "args": {...}} objects.
     *  Returns an empty list on any parse failure (caller falls back). */
    fun parse(text: String): List<Pair<String, Map<String, String>>> {
        val start = text.indexOf('[')
        val end = text.lastIndexOf(']')
        if (start < 0 || end <= start) return emptyList()
        val json = text.substring(start, end + 1)
        return try { parseArray(json) } catch (_: Exception) { emptyList() }
    }

    private class P(val s: String) {
        var i = 0
        fun ws() { while (i < s.length && s[i].isWhitespace()) i++ }
        fun expect(c: Char): Boolean { ws(); if (i < s.length && s[i] == c) { i++; return true }; return false }
        fun str(): String? {
            ws()
            if (i >= s.length || s[i] != '"') return null
            i++
            val sb = StringBuilder()
            while (i < s.length) {
                val c = s[i]
                if (c == '\\' && i + 1 < s.length) {
                    when (s[i + 1]) {
                        'n' -> sb.append('\n'); 't' -> sb.append('\t'); 'r' -> sb.append('\r')
                        '"' -> sb.append('"'); '\\' -> sb.append('\\'); '/' -> sb.append('/')
                        else -> sb.append(s[i + 1])
                    }
                    i += 2
                } else if (c == '"') { i++; return sb.toString() }
                else { sb.append(c); i++ }
            }
            return null
        }
        fun obj(): Map<String, String>? {
            if (!expect('{')) return null
            val map = mutableMapOf<String, String>()
            ws()
            if (expect('}')) return map
            while (true) {
                val k = str() ?: return null
                if (!expect(':')) return null
                val v = str() ?: return null
                map[k] = v
                ws()
                if (expect('}')) return map
                if (!expect(',')) return null
            }
        }
    }

    private fun parseArray(json: String): List<Pair<String, Map<String, String>>> {
        val p = P(json)
        if (!p.expect('[')) return emptyList()
        val out = mutableListOf<Pair<String, Map<String, String>>>()
        p.ws()
        if (p.expect(']')) return out
        while (true) {
            val obj = p.obj() ?: return emptyList()
            val tool = obj["tool"] ?: return emptyList()
            // args may be a nested object; re-parse it from the raw object map:
            // Our P.obj() only reads string values, so a nested args object
            // would fail — handle it by scanning the raw JSON for "args".
            out.add(tool to obj)
            p.ws()
            if (p.expect(']')) return out
            if (!p.expect(',')) return emptyList()
        }
    }

    /** Parse tool calls where args is a nested JSON object. This is the
     *  real parser used by the runtime (handles nested args correctly). */
    fun parseNested(text: String): List<Pair<String, Map<String, String>>> {
        val start = text.indexOf('[')
        val end = text.lastIndexOf(']')
        if (start < 0 || end <= start) return emptyList()
        val json = text.substring(start, end + 1)
        val out = mutableListOf<Pair<String, Map<String, String>>>()
        var idx = 0
        while (true) {
            val toolIdx = json.indexOf("\"tool\"", idx)
            if (toolIdx < 0) break
            val colon = json.indexOf(':', toolIdx)
            val q1 = json.indexOf('"', colon)
            val q2 = json.indexOf('"', q1 + 1)
            if (q1 < 0 || q2 < 0) break
            val tool = json.substring(q1 + 1, q2)
            val argsIdx = json.indexOf("\"args\"", q2)
            val args = mutableMapOf<String, String>()
            if (argsIdx >= 0) {
                val brace = json.indexOf('{', argsIdx)
                if (brace >= 0) {
                    var depth = 0; var j = brace; var inStr = false; var esc = false
                    var key: String? = null; var cur = StringBuilder(); var readingKey = true
                    // Simple nested-object scanner: reads string keys/values only.
                    val inner = StringBuilder()
                    while (j < json.length) {
                        val c = json[j]
                        if (esc) { inner.append(c); esc = false; j++; continue }
                        if (c == '\\' && inStr) { inner.append(c); esc = true; j++; continue }
                        if (c == '"') { inStr = !inStr; inner.append(c); j++; continue }
                        if (!inStr) {
                            if (c == '{') depth++
                            if (c == '}') {
                                depth--
                                if (depth == 0) break
                            }
                        }
                        inner.append(c); j++
                    }
                    // Parse key/value pairs from the inner object text.
                    val innerText = inner.toString()
                    val kv = Regex("\"((?:[^\"\\\\]|\\\\.)*)\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"")
                    for (m in kv.findAll(innerText)) {
                        val k = m.groupValues[1].replace("\\\"", "\"").replace("\\n", "\n")
                        val v = m.groupValues[2].replace("\\\"", "\"").replace("\\n", "\n").replace("\\\\", "\\")
                        args[k] = v
                    }
                    idx = j + 1
                    @Suppress("UNUSED_VARIABLE") val unusedKey = key
                    @Suppress("UNUSED_VARIABLE") val unusedCur = cur
                    @Suppress("UNUSED_VARIABLE") val unusedReading = readingKey
                }
            } else {
                idx = q2 + 1
            }
            out.add(tool to args)
        }
        return out
    }
}

class AgentRuntime(
    private val tools: ToolRegistry,
    private val onStep: (AgentStep) -> Unit = {}
) {
    companion object {
        const val MAX_ITERATIONS = 8
        const val TIMEOUT_MS = 120_000L
        const val MAX_ATTEMPTS_PER_TOOL = 2
    }

    fun run(goal: String, model: ModelClient?, cancelled: AtomicBoolean): AgentResult {
        val steps = mutableListOf<AgentStep>()
        val started = System.currentTimeMillis()
        val slug = if (goal.contains("restaurant", ignoreCase = true)) "restaurant" else "project"
        fun timedOut() = System.currentTimeMillis() - started > TIMEOUT_MS
        fun record(tool: String, args: Map<String, String>): AgentStep {
            val s = AgentStep(tool, args, AgentStepStatus.RUNNING)
            steps.add(s); onStep(s)
            return s
        }
        fun finishStep(s: AgentStep, ok: Boolean, output: String, t0: Long) {
            s.status = if (ok) AgentStepStatus.DONE else AgentStepStatus.FAILED
            s.output = output.take(400)
            s.durationMs = System.currentTimeMillis() - t0
            onStep(s)
        }

        // 1. PLAN
        var generatedByModel = false
        var plan: List<Pair<String, Map<String, String>>> = emptyList()
        if (model != null && !cancelled.get() && !timedOut()) {
            try {
                val prompt = "You are ROCKY, an autonomous coding agent. Goal: $goal. " +
                    "Reply ONLY with a JSON array of tool calls. Each call: " +
                    "{\"tool\":\"create_file\",\"args\":{\"slug\":\"$slug\",\"filename\":\"index.html\",\"content\":\"...\"}}. " +
                    "Use create_file for index.html, styles.css and script.js, then validate_project. " +
                    "Do not add any text outside the JSON array."
                val reply = model.generate(prompt)
                plan = ToolCallParser.parseNested(reply)
                generatedByModel = plan.isNotEmpty()
            } catch (_: Exception) {
                plan = emptyList()
            }
        }
        if (plan.isEmpty()) {
            // Scaffold fallback — ALWAYS labelled as scaffold, never as model output.
            val files = RestaurantScaffold.files()
            plan = files.map { (name, content) ->
                "create_file" to mapOf("slug" to slug, "filename" to name, "content" to content)
            } + listOf("validate_project" to mapOf("slug" to slug))
        }

        // 1b. PLANNER DISCIPLINE: only listed tools, capped steps, no
        // duplicates, never an empty file first. Skips are logged, not hidden.
        val validated = AgentPlanner.validatePlan(plan, ToolRegistry.knownTools, MAX_ITERATIONS)
        for (reason in validated.skipped) {
            val s = AgentStep("plan", emptyMap(), AgentStepStatus.FAILED, reason, 0L)
            steps.add(s); onStep(s)
        }
        plan = validated.steps

        // 2. EXECUTE (bounded iterations, bounded retries, cancellable).
        // Failures go through the RETRY / SKIP / REPLAN / ABORT vocabulary —
        // no ad-hoc retries, no infinite loops.
        var iterations = 0
        for ((tool, args) in plan) {
            if (cancelled.get()) break
            if (timedOut() || iterations >= MAX_ITERATIONS) break
            iterations++
            var attempt = 0; var ok = false; var out = ""
            var decision = RecoveryDecision.ABORT
            while (attempt < MAX_ATTEMPTS_PER_TOOL && !ok && !cancelled.get()) {
                attempt++
                val s = record(tool, args)
                val t0 = System.currentTimeMillis()
                try {
                    val r = tools.execute(tool, args)
                    ok = r.status == ToolStatus.DONE
                    out = r.output
                    finishStep(s, ok, out, t0)
                } catch (e: Exception) {
                    out = "Error: ${e.message}"
                    finishStep(s, false, out, t0)
                }
                if (!ok) {
                    val rec = AgentErrorHandler.decide(out, attempt, MAX_ATTEMPTS_PER_TOOL)
                    decision = rec.decision
                    s.output = "${rec.decision}: ${rec.reason} — ${rec.userMessage}".take(400)
                    onStep(s)
                    if (rec.decision != RecoveryDecision.RETRY) break
                }
            }
            if (!ok && decision != RecoveryDecision.SKIP) {
                // REPLAN/ABORT stop the plan; the validate + fix cycle below
                // still runs, and the final report states the exact failure.
                break
            }
        }

        // 3. VALIDATE + ONE FIX CYCLE (real, not staged)
        var validation = tools.validateProject(slug)
        if (!validation.ok && !cancelled.get() && iterations < MAX_ITERATIONS) {
            val fixStep = record("fix_project", mapOf("slug" to slug))
            val t0 = System.currentTimeMillis()
            val changed = tools.fixProject(slug)
            finishStep(fixStep, changed, if (changed) "Applied deterministic repair" else "No deterministic repair available", t0)
            validation = tools.validateProject(slug)
        }

        val success = validation.ok && steps.any { it.status == AgentStepStatus.DONE }
        val label = if (generatedByModel) "model output" else "scaffold tool (not model output)"
        val msg = buildString {
            append("Agent finished. Generated via $label. ")
            append("Validation: ${if (validation.ok) "PASSED" else "FAILED — ${validation.detail}"}. ")
            append("Files: ${tools.listProjectFiles(slug).joinToString(", ")}. ")
            if (!success) append("See the step log for the exact failure. ")
        }
        return AgentResult(steps, success, msg, slug, generatedByModel)
    }
}
