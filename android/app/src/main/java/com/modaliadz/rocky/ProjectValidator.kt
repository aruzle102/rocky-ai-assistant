package com.modaliadz.rocky

/** Real project validation — checks actual file contents, not a checklist claim. */
data class ValidationResult(val ok: Boolean, val detail: String)

object ProjectValidator {
    fun validate(files: Map<String, String>): ValidationResult {
        val html = files["index.html"] ?: return ValidationResult(false, "index.html is missing")
        if (html.isBlank()) return ValidationResult(false, "index.html is empty")
        val css = files["styles.css"] ?: return ValidationResult(false, "styles.css is missing")
        if (css.isBlank()) return ValidationResult(false, "styles.css is empty")
        val js = files["script.js"] ?: return ValidationResult(false, "script.js is missing")
        if (js.isBlank()) return ValidationResult(false, "script.js is empty")
        val lower = html.lowercase()
        if (!lower.contains("menu")) return ValidationResult(false, "index.html has no menu section")
        if (!lower.contains("gallery")) return ValidationResult(false, "index.html has no gallery section")
        if (!(lower.contains("reservation") || lower.contains("reserve"))) {
            return ValidationResult(false, "index.html has no reservation form")
        }
        if (!lower.contains("</html>")) return ValidationResult(false, "index.html is missing </html>")
        val imbalance = imbalance(js)
        if (imbalance != null) return ValidationResult(false, "script.js is unbalanced: $imbalance")
        return ValidationResult(true, "All required files present; menu, gallery and reservation sections found; script.js brackets balanced")
    }

    /** Returns a description of the first imbalance, or null if balanced. */
    fun imbalance(js: String): String? {
        var brace = 0; var paren = 0; var bracket = 0
        var inStr: Char? = null; var esc = false
        for (c in js) {
            if (esc) { esc = false; continue }
            if (c == '\\' && inStr != null) { esc = true; continue }
            if (c == '"' || c == '\'' || c == '`') {
                inStr = if (inStr == c) null else c
                continue
            }
            if (inStr != null) continue
            when (c) {
                '{' -> brace++
                '}' -> brace--
                '(' -> paren++
                ')' -> paren--
                '[' -> bracket++
                ']' -> bracket--
            }
            if (brace < 0) return "extra closing brace"
            if (paren < 0) return "extra closing parenthesis"
            if (bracket < 0) return "extra closing bracket"
        }
        if (brace != 0) return "$brace unclosed brace(s)"
        if (paren != 0) return "$paren unclosed parenthesis(es)"
        if (bracket != 0) return "$bracket unclosed bracket(s)"
        return null
    }
}

/** Deterministic repair for common, mechanical errors only. It never
 *  invents features — it closes what was left open. */
object ProjectFixer {
    fun fix(files: MutableMap<String, String>): Map<String, String> {
        val changed = mutableMapOf<String, String>()
        val js = files["script.js"]
        if (js != null) {
            var fixed = js
            var brace = 0; var paren = 0; var bracket = 0
            var inStr: Char? = null; var esc = false
            for (c in js) {
                if (esc) { esc = false; continue }
                if (c == '\\' && inStr != null) { esc = true; continue }
                if (c == '"' || c == '\'' || c == '`') { inStr = if (inStr == c) null else c; continue }
                if (inStr != null) continue
                when (c) { '{' -> brace++; '}' -> brace--; '(' -> paren++; ')' -> paren--; '[' -> bracket++; ']' -> bracket-- }
            }
            val tail = StringBuilder()
            repeat(bracket.coerceAtLeast(0)) { tail.append("]") }
            repeat(paren.coerceAtLeast(0)) { tail.append(")") }
            repeat(brace.coerceAtLeast(0)) { tail.append("}") }
            if (tail.isNotEmpty()) {
                fixed = js.trimEnd() + "\n" + tail.toString() + "\n"
                changed["script.js"] = fixed
            }
        }
        val html = files["index.html"]
        if (html != null) {
            var fixed = html
            if (!fixed.contains("</body>")) fixed += "\n</body>"
            if (!fixed.contains("</html>")) fixed += "\n</html>"
            if (fixed != html) changed["index.html"] = fixed
        }
        for ((k, v) in changed) files[k] = v
        return changed
    }
}
