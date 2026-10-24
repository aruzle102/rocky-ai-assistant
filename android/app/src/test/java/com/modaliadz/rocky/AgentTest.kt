package com.modaliadz.rocky

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files
import java.util.concurrent.atomic.AtomicBoolean

class AgentTest {
    private fun registry(tmp: File): ToolRegistry =
        ToolRegistry(File(tmp, "projects"), InMemoryFileStore(), InMemoryNoteStore(), FakeResearch(null))

    @Test
    fun modelPlanCreatesAndValidatesProject() {
        val tmp = Files.createTempDirectory("rocky-agent").toFile()
        val tools = registry(tmp)
        val scaffold = RestaurantScaffold.files()
        val json = """[{"tool":"create_file","args":{"slug":"restaurant","filename":"index.html","content":"${scaffold["index.html"]!!.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")}"}},
{"tool":"create_file","args":{"slug":"restaurant","filename":"styles.css","content":"${scaffold["styles.css"]!!.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")}"}},
{"tool":"create_file","args":{"slug":"restaurant","filename":"script.js","content":"${scaffold["script.js"]!!.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")}"}},
{"tool":"validate_project","args":{"slug":"restaurant"}}]"""
        val runtime = AgentRuntime(tools)
        val result = runtime.run("Build a restaurant website", FakeModel(json), AtomicBoolean(false))
        assertTrue(result.success)
        assertTrue(result.generatedByModel)
        assertEquals(listOf("index.html", "script.js", "styles.css"), tools.listProjectFiles("restaurant"))
        assertTrue(result.steps.all { it.status == AgentStepStatus.DONE })
    }

    @Test
    fun scaffoldFallbackIsLabelledNotModel() {
        val tmp = Files.createTempDirectory("rocky-scaffold").toFile()
        val tools = registry(tmp)
        val result = AgentRuntime(tools).run("Build a restaurant website", null, AtomicBoolean(false))
        assertTrue(result.success)
        assertFalse(result.generatedByModel)
        assertTrue(result.message.contains("scaffold tool (not model output)"))
        assertTrue(tools.validateProject("restaurant").ok)
    }

    @Test
    fun brokenJsIsDetectedFixedAndRevalidated() {
        val tmp = Files.createTempDirectory("rocky-fix").toFile()
        val tools = registry(tmp)
        val scaffold = RestaurantScaffold.files()
        tools.writeProjectFile("restaurant", "index.html", scaffold["index.html"]!!)
        tools.writeProjectFile("restaurant", "styles.css", scaffold["styles.css"]!!)
        tools.writeProjectFile("restaurant", "script.js", "function broken() { console.log('hi'")
        assertFalse(tools.validateProject("restaurant").ok)
        assertTrue(tools.fixProject("restaurant"))
        assertTrue(tools.validateProject("restaurant").ok)
        val fixed = tools.readProjectFile("restaurant", "script.js")!!
        assertTrue(fixed.trimEnd().endsWith("}"))
    }

    @Test
    fun parserHandlesNestedArgsAndEscapes() {
        val calls = ToolCallParser.parseNested(
            """[{"tool":"create_file","args":{"slug":"restaurant","filename":"a.txt","content":"line1\nline2"}}]"""
        )
        assertEquals(1, calls.size)
        assertEquals("create_file", calls[0].first)
        assertEquals("line1\nline2", calls[0].second["content"])
    }

    @Test
    fun parserRejectsInvalidJson() {
        assertTrue(ToolCallParser.parseNested("not json at all").isEmpty())
        assertTrue(ToolCallParser.parseNested("[{bad").isEmpty())
    }

    @Test
    fun cancelledRunDoesNotClaimSuccess() {
        val tmp = Files.createTempDirectory("rocky-cancel").toFile()
        val tools = registry(tmp)
        val result = AgentRuntime(tools).run("Build a restaurant website", null, AtomicBoolean(true))
        assertFalse(result.success)
        assertTrue(result.steps.isEmpty())
    }
}
