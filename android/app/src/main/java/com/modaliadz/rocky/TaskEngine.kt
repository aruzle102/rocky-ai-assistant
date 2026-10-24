package com.modaliadz.rocky

/** Plan → Execute → Verify → Report. A step is DONE only when its result is
 *  verified; anything else is FAILED or UNSUPPORTED, never a fake success. */
enum class StepStatus { PENDING, DONE, FAILED, UNSUPPORTED }
enum class StepKind { CREATE_FILE, RESEARCH, NOTE, REMINDER, OPEN_URL, PLAN_ONLY }

data class TaskStep(
    val kind: StepKind, val title: String, val param: String = "",
    var status: StepStatus = StepStatus.PENDING, var detail: String = ""
)

interface FileStore {
    fun write(name: String, content: String): Boolean
    fun read(name: String): String?
}

interface NoteStore {
    fun addNote(text: String): Boolean
    fun addReminder(text: String, whenText: String): Boolean
}

data class ResearchResult(val summary: String, val source: String)

interface ResearchClient {
    fun search(query: String): ResearchResult?
}

object TaskEngine {
    val unsupportedKeywords = listOf("call ", "sms", "whatsapp", "email", "send message", "buy ", "purchase", "photo", "contact")

    fun planFor(input: String): List<TaskStep> {
        val t = input.trim()
        return when {
            t.startsWith("create file", ignoreCase = true) || t.startsWith("create note", ignoreCase = true) -> {
                // Forms: "create file hello.txt with: Hello" / "create file: hello.txt with: Hello"
                val afterColon = if (t.contains(":")) t.substringAfter(":").trim() else null
                val rest = afterColon ?: t.removePrefix("create file").removePrefix("create note").trim()
                val name = rest.substringBefore(" with", rest).trim().ifBlank { "note.txt" }
                val content = if (rest.contains(" with:")) rest.substringAfter(" with:").trim() else ""
                listOf(TaskStep(StepKind.CREATE_FILE, "Create file $name", "$name\n$content"))
            }
            t.startsWith("research", ignoreCase = true) -> {
                val q = t.substringAfter(":", t).trim()
                listOf(TaskStep(StepKind.RESEARCH, "Research: $q", q))
            }
            t.startsWith("note", ignoreCase = true) -> {
                listOf(TaskStep(StepKind.NOTE, "Save note", t.substringAfter(":", t).trim()))
            }
            t.startsWith("remind", ignoreCase = true) -> {
                listOf(TaskStep(StepKind.REMINDER, "Save reminder (in-app only)", t.substringAfter(":", t).trim()))
            }
            t.startsWith("open ", ignoreCase = true) -> {
                listOf(TaskStep(StepKind.OPEN_URL, "Open link", t.removePrefix("open ").trim()))
            }
            unsupportedKeywords.any { t.lowercase().contains(it) } -> {
                listOf(TaskStep(StepKind.PLAN_ONLY, "Unsupported action", t))
            }
            else -> listOf(
                TaskStep(StepKind.PLAN_ONLY, "Understand the request", t),
                TaskStep(StepKind.PLAN_ONLY, "Break it into steps and report", t)
            )
        }
    }

    fun execute(steps: List<TaskStep>, files: FileStore, notes: NoteStore, research: ResearchClient): String {
        for (s in steps) {
            try {
                when (s.kind) {
                    StepKind.CREATE_FILE -> {
                        val name = s.param.substringBefore("\n").trim()
                        val content = s.param.substringAfter("\n", "")
                        if (name.isBlank() || !files.write(name, content)) {
                            s.status = StepStatus.FAILED; s.detail = "Could not write file $name"
                        } else if (files.read(name) == content) {
                            s.status = StepStatus.DONE; s.detail = "Verified: file $name contains the expected content"
                        } else {
                            s.status = StepStatus.FAILED; s.detail = "Verification failed: read-back did not match for $name"
                        }
                    }
                    StepKind.RESEARCH -> {
                        val r = research.search(s.param)
                        if (r != null && r.summary.isNotBlank() && r.source.isNotBlank()) {
                            s.status = StepStatus.DONE; s.detail = "${r.summary} (Source: ${r.source})"
                        } else {
                            s.status = StepStatus.FAILED; s.detail = "No research result found for '${s.param}'"
                        }
                    }
                    StepKind.NOTE -> {
                        if (notes.addNote(s.param)) { s.status = StepStatus.DONE; s.detail = "Note saved in the app" }
                        else { s.status = StepStatus.FAILED; s.detail = "Could not save the note" }
                    }
                    StepKind.REMINDER -> {
                        if (notes.addReminder(s.param, "")) {
                            s.status = StepStatus.DONE; s.detail = "Reminder saved in the app (in-app only — not a system alarm)"
                        } else { s.status = StepStatus.FAILED; s.detail = "Could not save the reminder" }
                    }
                    StepKind.OPEN_URL -> {
                        val url = s.param
                        if (url.startsWith("http://") || url.startsWith("https://")) {
                            s.status = StepStatus.DONE; s.detail = "OPEN_URL:$url"
                        } else {
                            s.status = StepStatus.UNSUPPORTED; s.detail = "Only http(s) links can be opened from ROCKY"
                        }
                    }
                    StepKind.PLAN_ONLY -> {
                        if (unsupportedKeywords.any { s.param.lowercase().contains(it) }) {
                            s.status = StepStatus.UNSUPPORTED; s.detail = "Not supported from ROCKY: ${s.param}. ROCKY cannot control calls, messages, purchases or phone contacts."
                        } else {
                            s.status = StepStatus.DONE; s.detail = "Planning step recorded (no system action)"
                        }
                    }
                }
            } catch (e: Exception) {
                s.status = StepStatus.FAILED; s.detail = "Error: ${e.message}"
            }
        }
        val done = steps.count { it.status == StepStatus.DONE }
        val failed = steps.count { it.status == StepStatus.FAILED }
        val uns = steps.count { it.status == StepStatus.UNSUPPORTED }
        return buildString {
            append("Report: $done done, $failed failed, $uns unsupported (of ${steps.size} steps).\n")
            for (s in steps) append("- ${s.title}: ${s.status} — ${s.detail}\n")
        }
    }
}
