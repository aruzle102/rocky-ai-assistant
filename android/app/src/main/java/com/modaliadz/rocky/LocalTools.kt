package com.modaliadz.rocky

import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import kotlin.math.abs

/**
 * Honest LOCAL assistant tools. This is not a language model and must never be
 * presented as one. Returns null when the input is not a tool query, so the
 * caller can show the offline capability message instead of a fake chat reply.
 */
object LocalTools {
    private val cities = mapOf(
        "algiers" to "Africa/Algiers", "alger" to "Africa/Algiers",
        "paris" to "Europe/Paris", "london" to "Europe/London",
        "new york" to "America/New_York", "dubai" to "Asia/Dubai",
        "tokyo" to "Asia/Tokyo", "cairo" to "Africa/Cairo"
    )

    fun answer(input: String, userName: String): String? {
        val t = input.trim().lowercase()
        if (t.isEmpty()) return null
        if (t.contains("what time") || t.contains("time in") || t == "time" || t.contains("heure") || t.contains("الساعة")) {
            for ((name, zone) in cities) {
                if (t.contains(name)) {
                    val now = ZonedDateTime.now(ZoneId.of(zone))
                    return "It is ${now.format(DateTimeFormatter.ofPattern("HH:mm"))} in ${name.replaceFirstChar { it.uppercase() }}."
                }
            }
            return "It is ${ZonedDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm"))} here."
        }
        if (t.contains("what date") || t.contains("today") || t.contains("date")) {
            return "Today is ${ZonedDateTime.now().format(DateTimeFormatter.ofPattern("EEEE, d MMMM yyyy"))}."
        }
        if (t.contains("your name") || t.contains("who are you")) {
            return "I am ROCKY AI, a native Android assistant. Right now I am running in local mode — no cloud model is connected."
        }
        if (t.startsWith("remember ") || t.startsWith("my name is ")) {
            return "MEMORY_NOTE:" + input.trim()
        }
        // Safe calculator: only digits, spaces and + - * / ( ) . allowed.
        val calc = t.removePrefix("calculate ").removePrefix("calc ").trim()
        if (calc.matches(Regex("[0-9+\\-*/(). ]+")) && calc.any { it.isDigit() } && calc.any { it in "+-*/" }) {
            return try {
                val v = Calc.eval(calc)
                "$calc = ${formatNum(v)}"
            } catch (_: Exception) { null }
        }
        val conv = convert(t)
        if (conv != null) return conv
        if (t.contains("help") || t.contains("what can you do")) {
            val n = if (userName.isNotBlank()) ", $userName" else ""
            return "Local mode$n: I can tell the time and date, calculate, convert units, remember notes, plan and run file/research tasks, and — once you add a free provider key in Settings — answer open-ended questions with a real model. I do not pretend to be a cloud model while offline."
        }
        return null
    }

    fun offlineMessage(): String =
        "Offline: I can do time, calculations, conversions, notes and tasks, but open-ended chat needs a real provider. Open Settings, enable Pollinations (keyless) or add a free key for OpenRouter / Gemini / Groq, then tap Test."

    private fun formatNum(v: Double): String =
        if (v == v.toLong().toDouble()) v.toLong().toString() else "%.4f".format(v).trimEnd('0').trimEnd('.')

    private fun convert(t: String): String? {
        val m = Regex("([0-9.]+)\\s*(km|miles?|celsius|fahrenheit|kg|lb|pounds?)\\s+(?:to|in|en)\\s+(km|miles?|celsius|fahrenheit|kg|lb|pounds?)").find(t) ?: return null
        val v = m.groupValues[1].toDoubleOrNull() ?: return null
        val from = m.groupValues[2]; val to = m.groupValues[3]
        val out: Double? = when {
            from.startsWith("km") && to.startsWith("mile") -> v * 0.621371
            from.startsWith("mile") && to.startsWith("km") -> v * 1.60934
            from == "celsius" && to == "fahrenheit" -> v * 9 / 5 + 32
            from == "fahrenheit" && to == "celsius" -> (v - 32) * 5 / 9
            from == "kg" && (to == "lb" || to == "pounds") -> v * 2.20462
            (from == "lb" || from == "pounds") && to == "kg" -> v * 0.453592
            else -> null
        }
        return out?.let { "${formatNum(v)} $from = ${formatNum(it)} $to" }
    }

    /** Shunting-yard evaluator for + - * / and parentheses. Throws on bad input. */
    object Calc {
        fun eval(expr: String): Double {
            val out = ArrayDeque<Double>(); val ops = ArrayDeque<Char>()
            var i = 0; var prevOp = true
            fun prec(c: Char) = if (c == '+' || c == '-') 1 else if (c == '*' || c == '/') 2 else 0
            fun apply() {
                val b = out.removeLast(); val a = out.removeLast(); val op = ops.removeLast()
                out.addLast(when (op) { '+' -> a + b; '-' -> a - b; '*' -> a * b; '/' -> a / b; else -> throw IllegalArgumentException("op") })
            }
            while (i < expr.length) {
                val c = expr[i]
                when {
                    c.isWhitespace() -> i++
                    c.isDigit() || c == '.' -> {
                        var j = i
                        while (j < expr.length && (expr[j].isDigit() || expr[j] == '.')) j++
                        out.addLast(expr.substring(i, j).toDouble()); i = j; prevOp = false
                    }
                    c == '(' -> { ops.addLast(c); i++; prevOp = true }
                    c == ')' -> {
                        while (ops.isNotEmpty() && ops.last() != '(') apply()
                        if (ops.isEmpty()) throw IllegalArgumentException("paren")
                        ops.removeLast(); i++; prevOp = false
                    }
                    c in "+-*/" -> {
                        if (c == '-' && prevOp) { // unary minus: push 0 then subtract
                            out.addLast(0.0)
                        }
                        while (ops.isNotEmpty() && ops.last() != '(' && prec(ops.last()) >= prec(c)) apply()
                        ops.addLast(c); i++; prevOp = true
                    }
                    else -> throw IllegalArgumentException("char $c")
                }
            }
            while (ops.isNotEmpty()) {
                if (ops.last() == '(') throw IllegalArgumentException("paren")
                apply()
            }
            if (out.size != 1) throw IllegalArgumentException("expr")
            val r = out.last()
            if (r.isNaN() || r.isInfinite()) throw IllegalArgumentException("range")
            return r
        }
    }

    @Suppress("unused")
    fun unusedAbs(x: Double) = abs(x)
}
