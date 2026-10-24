package com.modaliadz.rocky

import java.util.concurrent.atomic.AtomicBoolean

/**
 * Source-grounded research, adapted from JARVIS actions/deep_research.py
 * (Kotlin port of the logic, not a copy of the Python file).
 * Depth tiers: quick = 3 queries / 10 sources, standard = 6 / 20,
 * deep = 10 / 35. Briefs are cached for 15 minutes. Runs are cancellable.
 * Summaries are extractive from real search results unless a model is
 * supplied, in which case the synthesis is labelled as model synthesis.
 * Sources are the search results actually returned — never invented.
 */
enum class ResearchDepth(val queries: Int, val maxSources: Int) {
    QUICK(3, 10), STANDARD(6, 20), DEEP(10, 35)
}

data class DeepBrief(
    val query: String,
    val depth: ResearchDepth,
    val findings: List<ResearchResult>,
    val sources: List<String>,
    val summary: String,
    val fromCache: Boolean,
    val cancelled: Boolean
)

class DeepResearch(
    private val research: ResearchClient,
    private val model: ModelClient? = null
) {
    companion object {
        const val BRIEF_TTL_MS = 15 * 60 * 1000L
        private val VARIANTS = listOf(
            "", " overview", " facts", " guide", " examples",
            " history", " how it works", " best practices", " problems", " latest news"
        )
    }

    private val cache = mutableMapOf<String, Pair<Long, DeepBrief>>()

    fun subQueries(query: String, depth: ResearchDepth): List<String> =
        VARIANTS.take(depth.queries).map { query + it }

    fun run(
        query: String, depth: ResearchDepth, cancelled: AtomicBoolean,
        nowMs: Long = System.currentTimeMillis()
    ): DeepBrief {
        val key = depth.name + "|" + query
        cache[key]?.let { (t, brief) ->
            if (nowMs - t < BRIEF_TTL_MS) return brief.copy(fromCache = true)
        }
        val findings = mutableListOf<ResearchResult>()
        for (q in subQueries(query, depth)) {
            if (cancelled.get()) {
                return DeepBrief(query, depth, findings, findings.map { it.source }.distinct(), extractive(findings), false, true)
            }
            if (findings.size >= depth.maxSources) break
            val r = try { research.search(q) } catch (_: Exception) { null }
            if (r != null && r.summary.isNotBlank()) findings.add(r)
        }
        val summary = if (model != null && findings.isNotEmpty()) {
            try {
                val s = model.generate(
                    "Summarise these research findings briefly and keep the source names: " +
                        findings.joinToString("\n") { "${it.source}: ${it.summary}" }
                )
                if (s.isNotBlank()) "Model synthesis: $s" else extractive(findings)
            } catch (_: Exception) {
                extractive(findings)
            }
        } else {
            extractive(findings)
        }
        val brief = DeepBrief(query, depth, findings, findings.map { it.source }.distinct(), summary, false, false)
        cache[key] = nowMs to brief
        return brief
    }

    private fun extractive(findings: List<ResearchResult>): String {
        if (findings.isEmpty()) return "No research results found."
        return "Extractive summary (no model): " + findings.joinToString(" ") { it.summary.take(200) }
    }
}
