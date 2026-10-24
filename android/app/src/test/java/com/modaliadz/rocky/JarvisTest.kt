package com.modaliadz.rocky

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class JarvisTest {
    @Test
    fun transientErrorRetriesThenAborts() {
        val first = AgentErrorHandler.decide("Network timeout", 1, 2)
        assertEquals(RecoveryDecision.RETRY, first.decision)
        assertTrue(first.userMessage.contains("retrying"))
        val last = AgentErrorHandler.decide("Network timeout", 2, 2)
        assertEquals(RecoveryDecision.ABORT, last.decision)
    }

    @Test
    fun unsupportedAndConfirmationSkip() {
        assertEquals(RecoveryDecision.SKIP, AgentErrorHandler.decide("Only http(s) links — UNSUPPORTED", 1, 2).decision)
        assertEquals(RecoveryDecision.SKIP, AgentErrorHandler.decide("Delete needs confirmation", 1, 2).decision)
    }

    @Test
    fun validationFailureReplans() {
        val r = AgentErrorHandler.decide("script.js is unbalanced: 1 unclosed brace", 1, 2)
        assertEquals(RecoveryDecision.REPLAN, r.decision)
        assertTrue(r.fixSuggestion.contains("re-validate"))
    }

    @Test
    fun unknownErrorAborts() {
        assertEquals(RecoveryDecision.ABORT, AgentErrorHandler.decide("Something strange happened", 1, 2).decision)
    }

    @Test
    fun plannerRejectsUnknownToolsAndEmptyFiles() {
        val plan = listOf(
            "create_file" to mapOf("slug" to "restaurant", "filename" to "index.html", "content" to ""),
            "delete_system" to mapOf<String, String>(),
            "create_file" to mapOf("slug" to "restaurant", "filename" to "index.html", "content" to "<html></html>"),
            "validate_project" to mapOf("slug" to "restaurant")
        )
        val v = AgentPlanner.validatePlan(plan, ToolRegistry.knownTools, 8)
        assertEquals(2, v.steps.size)
        assertEquals("create_file", v.steps[0].first)
        assertTrue(v.skipped.any { it.contains("empty") })
        assertTrue(v.skipped.any { it.contains("unknown tool") })
    }

    @Test
    fun plannerCapsStepsAndRemovesDuplicates() {
        val plan = (1..12).map {
            "read_file" to mapOf("slug" to "restaurant", "filename" to "index.html")
        }
        val v = AgentPlanner.validatePlan(plan, ToolRegistry.knownTools, 8)
        assertEquals(1, v.steps.size) // duplicates removed, then cap
        assertTrue(v.skipped.any { it.contains("duplicate") })
        val distinct = (1..12).map { i ->
            "read_file" to mapOf("slug" to "s", "filename" to "f$i")
        }
        val v2 = AgentPlanner.validatePlan(distinct, ToolRegistry.knownTools, 8)
        assertEquals(8, v2.steps.size)
        assertTrue(v2.skipped.any { it.contains("exceeds") })
    }

    @Test
    fun cappedMemoryTruncatesValueAndTotal() {
        val m = CappedMemory()
        assertFalse(m.put("unknown_category", "k", "v"))
        m.put("notes", "long", "x".repeat(500))
        assertEquals(380, m.get("notes", "long")!!.length)
        for (i in 1..10) m.put("notes", "n$i", "y".repeat(380))
        assertTrue(m.totalChars() <= 2200)
        assertTrue(m.all().isNotEmpty())
    }

    @Test
    fun cappedMemoryJsonRoundTrip() {
        val m = CappedMemory()
        m.put("identity", "name", "ROCKY")
        m.put("projects", "restaurant", "menu + gallery + reservation")
        val json = m.toJson()
        val m2 = CappedMemory()
        m2.fromJson(json)
        assertEquals("ROCKY", m2.get("identity", "name"))
        assertEquals("menu + gallery + reservation", m2.get("projects", "restaurant"))
    }
}
