package com.modaliadz.rocky

import java.io.File
import java.io.FileOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/** Tool execution results. NEEDS_CONFIRMATION and UNSUPPORTED are NOT
 *  successes — the agent and the UI must report them as such. */
enum class ToolStatus { DONE, FAILED, NEEDS_CONFIRMATION, UNSUPPORTED }
data class ToolResult(val status: ToolStatus, val output: String)

/**
 * Tools that ACTUALLY work on-device. Generated web code runs ONLY inside
 * the preview WebView sandbox — it is never executed as app code and never
 * gets access to credentials or app-private files outside the project dir.
 * Sensitive actions (delete/share/send) require confirmation.
 */
class ToolRegistry(
    private val projectsRoot: File,
    private val flatFiles: FileStore,
    private val notes: NoteStore,
    private val research: ResearchClient
) {
    fun projectDir(slug: String): File = File(projectsRoot, slug)

    fun listProjectFiles(slug: String): List<String> {
        val dir = projectDir(slug)
        return if (dir.exists()) dir.listFiles()?.map { it.name }?.sorted() ?: emptyList() else emptyList()
    }

    fun listProjects(): List<String> {
        return if (projectsRoot.exists()) {
            projectsRoot.listFiles()?.filter { it.isDirectory }?.map { it.name }?.sorted() ?: emptyList()
        } else emptyList()
    }

    fun readProjectFile(slug: String, filename: String): String? {
        val f = File(projectDir(slug), filename)
        return if (f.exists()) f.readText() else null
    }

    fun writeProjectFile(slug: String, filename: String, content: String): Boolean {
        return try {
            val dir = projectDir(slug)
            if (!dir.exists()) dir.mkdirs()
            val safe = filename.replace(Regex("[\\\\/:*?\"<>|]"), "_")
            File(dir, safe).writeText(content)
            true
        } catch (_: Exception) { false }
    }

    fun projectFilesMap(slug: String): Map<String, String> {
        val out = mutableMapOf<String, String>()
        for (name in listProjectFiles(slug)) {
            readProjectFile(slug, name)?.let { out[name] = it }
        }
        return out
    }

    fun validateProject(slug: String): ValidationResult =
        ProjectValidator.validate(projectFilesMap(slug))

    /** Applies the deterministic repair and writes changed files back. */
    fun fixProject(slug: String): Boolean {
        val files = projectFilesMap(slug).toMutableMap()
        val changed = ProjectFixer.fix(files)
        if (changed.isEmpty()) return false
        for ((name, content) in changed) writeProjectFile(slug, name, content)
        return true
    }

    fun exportProjectZip(slug: String): Pair<String, Int>? {
        return try {
            val dir = projectDir(slug)
            if (!dir.exists()) return null
            val exports = File(projectsRoot, "exports")
            if (!exports.exists()) exports.mkdirs()
            val outFile = File(exports, "$slug.zip")
            val files = dir.listFiles()?.filter { it.isFile }?.sortedBy { it.name } ?: emptyList()
            if (files.isEmpty()) return null
            ZipOutputStream(FileOutputStream(outFile)).use { zip ->
                for (f in files) {
                    zip.putNextEntry(ZipEntry(f.name))
                    zip.write(f.readBytes())
                    zip.closeEntry()
                }
            }
            outFile.absolutePath to files.size
        } catch (_: Exception) { null }
    }

    /** Explain a file with LOCAL analysis only (structure, not a model). */
    fun explainFile(slug: String?, filename: String): String {
        val content = if (slug != null) readProjectFile(slug, filename) else flatFiles.read(filename)
            ?: return "File not found: $filename"
        val lines = content.lines().size
        val funs = Regex("""(?:function\s+(\w+)|fun\s+(\w+))""").findAll(content)
            .mapNotNull { it.groupValues.getOrNull(1)?.takeIf { v -> v.isNotBlank() } ?: it.groupValues.getOrNull(2)?.takeIf { v -> v.isNotBlank() } }
            .toList()
        return "Local analysis of $filename: $lines lines" +
            if (funs.isNotEmpty()) ", functions: ${funs.joinToString(", ")}." else ". " +
            "This is a structural summary from the file itself, not a model explanation."
    }

    fun execute(tool: String, args: Map<String, String>): ToolResult {
        return when (tool) {
            "create_file" -> {
                val slug = args["slug"]
                val filename = args["filename"] ?: return ToolResult(ToolStatus.FAILED, "create_file needs filename")
                val content = args["content"] ?: ""
                val ok = if (slug != null) writeProjectFile(slug, filename, content)
                else flatFiles.write(filename, content)
                if (ok) ToolResult(ToolStatus.DONE, "Created $filename") else ToolResult(ToolStatus.FAILED, "Could not create $filename")
            }
            "edit_file" -> {
                val slug = args["slug"]
                val filename = args["filename"] ?: return ToolResult(ToolStatus.FAILED, "edit_file needs filename")
                val old = args["old"] ?: return ToolResult(ToolStatus.FAILED, "edit_file needs old text")
                val newText = args["new"] ?: ""
                val current = if (slug != null) readProjectFile(slug, filename) else flatFiles.read(filename)
                    ?: return ToolResult(ToolStatus.FAILED, "File not found: $filename")
                if (!current.contains(old)) return ToolResult(ToolStatus.FAILED, "Old text not found in $filename")
                val updated = current.replace(old, newText)
                val ok = if (slug != null) writeProjectFile(slug, filename, updated) else flatFiles.write(filename, updated)
                if (ok) ToolResult(ToolStatus.DONE, "Edited $filename") else ToolResult(ToolStatus.FAILED, "Could not save $filename")
            }
            "read_file" -> {
                val slug = args["slug"]
                val filename = args["filename"] ?: return ToolResult(ToolStatus.FAILED, "read_file needs filename")
                val content = if (slug != null) readProjectFile(slug, filename) else flatFiles.read(filename)
                if (content != null) ToolResult(ToolStatus.DONE, content.take(4000)) else ToolResult(ToolStatus.FAILED, "File not found: $filename")
            }
            "list_files" -> {
                val slug = args["slug"]
                val names = if (slug != null) listProjectFiles(slug) else listProjects()
                ToolResult(ToolStatus.DONE, names.joinToString(", "))
            }
            "delete_file" -> {
                if (args["confirmed"] != "true") {
                    return ToolResult(ToolStatus.NEEDS_CONFIRMATION, "Delete needs confirmation: call again with confirmed=true, or confirm in the UI")
                }
                val slug = args["slug"]
                val filename = args["filename"] ?: return ToolResult(ToolStatus.FAILED, "delete_file needs filename")
                val f = if (slug != null) File(projectDir(slug), filename) else File(filename)
                val deleted = try { f.exists() && f.delete() } catch (_: Exception) { false }
                if (deleted) ToolResult(ToolStatus.DONE, "Deleted $filename") else ToolResult(ToolStatus.FAILED, "Could not delete $filename")
            }
            "web_research" -> {
                val q = args["query"] ?: return ToolResult(ToolStatus.FAILED, "web_research needs query")
                val r = research.search(q)
                if (r != null) ToolResult(ToolStatus.DONE, "${r.summary} (Source: ${r.source})")
                else ToolResult(ToolStatus.FAILED, "No research result for '$q'")
            }
            "create_note" -> {
                val text = args["text"] ?: return ToolResult(ToolStatus.FAILED, "create_note needs text")
                if (notes.addNote(text)) ToolResult(ToolStatus.DONE, "Note saved in the app") else ToolResult(ToolStatus.FAILED, "Could not save note")
            }
            "create_reminder" -> {
                val text = args["text"] ?: return ToolResult(ToolStatus.FAILED, "create_reminder needs text")
                if (notes.addReminder(text, args["when"] ?: "")) {
                    ToolResult(ToolStatus.DONE, "Reminder saved in the app (in-app only — not a system alarm)")
                } else ToolResult(ToolStatus.FAILED, "Could not save reminder")
            }
            "open_url" -> {
                val url = args["url"] ?: return ToolResult(ToolStatus.FAILED, "open_url needs url")
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    ToolResult(ToolStatus.DONE, "OPEN_URL:$url")
                } else ToolResult(ToolStatus.UNSUPPORTED, "Only http(s) links can be opened from ROCKY")
            }
            "explain_code" -> {
                ToolResult(ToolStatus.DONE, explainFile(args["slug"], args["filename"] ?: ""))
            }
            "validate_project" -> {
                val slug = args["slug"] ?: return ToolResult(ToolStatus.FAILED, "validate_project needs slug")
                val v = validateProject(slug)
                if (v.ok) ToolResult(ToolStatus.DONE, v.detail) else ToolResult(ToolStatus.FAILED, v.detail)
            }
            "preview_project" -> {
                val slug = args["slug"] ?: return ToolResult(ToolStatus.FAILED, "preview_project needs slug")
                val idx = readProjectFile(slug, "index.html")
                if (idx != null) ToolResult(ToolStatus.DONE, "Preview ready for $slug — open it in the Preview screen") else ToolResult(ToolStatus.FAILED, "No index.html in $slug")
            }
            "export_project_zip" -> {
                val slug = args["slug"] ?: return ToolResult(ToolStatus.FAILED, "export_project_zip needs slug")
                val r = exportProjectZip(slug)
                if (r != null) ToolResult(ToolStatus.DONE, "Exported ${r.first} with ${r.second} entries") else ToolResult(ToolStatus.FAILED, "Could not export $slug")
            }
            else -> ToolResult(ToolStatus.UNSUPPORTED, "Unknown tool: $tool")
        }
    }
}
