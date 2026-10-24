package com.modaliadz.rocky

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files
import java.util.concurrent.atomic.AtomicBoolean

class CountingResearch : ResearchClient {
    val calls = mutableListOf<String>()
    override fun search(query: String): ResearchResult? {
        calls.add(query)
        return ResearchResult("Summary for $query", "Source-$query")
    }
}

class ReuseTest {
    private fun registry(tmp: File, cancelled: AtomicBoolean = AtomicBoolean(false)): ToolRegistry =
        ToolRegistry(File(tmp, "projects"), InMemoryFileStore(), InMemoryNoteStore(), FakeResearch(null), cancelled)

    @Test
    fun safeRootRejectsEscape() {
        val tmp = Files.createTempDirectory("rocky-safe").toFile()
        val tools = registry(tmp)
        // Bare ".." would escape the project root: rejected by the
        // canonical-path check, and nothing is written outside the root.
        assertFalse(tools.writeProjectFile("p", "..", "x"))
        assertNull(tools.readProjectFile("p", ".."))
        // "../evil.txt" is flattened to ".._evil.txt" inside the project
        // dir: traversal is neutralised, nothing lands outside the root.
        assertTrue(tools.writeProjectFile("p", "../evil.txt", "x"))
        assertEquals("x", tools.readProjectFile("p", "../evil.txt"))
        assertFalse(File(tmp, "evil.txt").exists())
        assertFalse(File(tmp, "projects/evil.txt").exists())
        // A hostile slug is sanitised inside the root, never outside it.
        assertTrue(tools.writeProjectFile("../evil", "a.txt", "hello"))
        assertFalse(File(File(tmp, "projects"), "a.txt").exists())
        assertEquals("hello", tools.readProjectFile("../evil", "a.txt"))
    }

    @Test
    fun stampsRecordCreatorAndTimestamp() {
        val tmp = Files.createTempDirectory("rocky-stamp").toFile()
        val tools = registry(tmp)
        assertTrue(tools.writeProjectFile("p", "a.txt", "hello", "create_file"))
        val sidecar = File(File(File(tmp, "projects"), "p"), ".rocky-stamps.json")
        assertTrue(sidecar.exists())
        val text = sidecar.readText()
        assertTrue(text.contains("a.txt"))
        assertTrue(text.contains("create_file"))
        assertTrue(text.contains("\"at\":"))
        // Stamps are hidden from the project listing.
        assertEquals(listOf("a.txt"), tools.listProjectFiles("p"))
    }

    @Test
    fun deepResearchDepthTiers() {
        val research = CountingResearch()
        val deep = DeepResearch(research)
        val quick = deep.run("Algiers", ResearchDepth.QUICK, AtomicBoolean(false))
        assertEquals(3, research.calls.size)
        assertEquals(3, quick.findings.size)
        assertEquals(3, quick.sources.size)
        assertTrue(quick.summary.contains("Extractive summary"))
        val standard = deep.run("Algiers", ResearchDepth.STANDARD, AtomicBoolean(false))
        assertEquals(3 + 6, research.calls.size)
        assertEquals(6, standard.findings.size)
        val deepBrief = deep.run("Algiers", ResearchDepth.DEEP, AtomicBoolean(false))
        assertEquals(3 + 6 + 10, research.calls.size)
        assertEquals(10, deepBrief.findings.size)
        assertTrue(deepBrief.findings.size <= ResearchDepth.DEEP.maxSources)
    }

    @Test
    fun deepResearchCacheTtlAndCancellation() {
        val research = CountingResearch()
        val deep = DeepResearch(research)
        val first = deep.run("Algiers", ResearchDepth.QUICK, AtomicBoolean(false), 0L)
        assertFalse(first.fromCache)
        val cached = deep.run("Algiers", ResearchDepth.QUICK, AtomicBoolean(false), 1000L)
        assertTrue(cached.fromCache)
        assertEquals(3, research.calls.size)
        val fresh = deep.run("Algiers", ResearchDepth.QUICK, AtomicBoolean(false), 16 * 60 * 1000L)
        assertFalse(fresh.fromCache)
        assertEquals(6, research.calls.size)
        val cancelled = deep.run("Paris", ResearchDepth.DEEP, AtomicBoolean(true), 0L)
        assertTrue(cancelled.cancelled)
        assertTrue(cancelled.findings.isEmpty())
        assertEquals(6, research.calls.size)
    }

    @Test
    fun deepResearchToolIsCancellable() {
        val tmp = Files.createTempDirectory("rocky-deep-tool").toFile()
        val tools = ToolRegistry(
            File(tmp, "projects"), InMemoryFileStore(), InMemoryNoteStore(),
            CountingResearch(), AtomicBoolean(true)
        )
        val res = tools.execute("deep_research", mapOf("query" to "Algiers", "depth" to "quick"))
        assertEquals(ToolStatus.FAILED, res.status)
        assertTrue(res.output.contains("cancelled"))
    }

    @Test
    fun rateLimitFailsOverWithoutRetryingSameProvider() {
        val http = FakeHttp()
        val posts = mutableListOf<String>()
        http.postHandler = { url, _ ->
            posts.add(url)
            if (url.contains("openrouter")) HttpResponse(429, "rate limit exceeded")
            else HttpResponse(200, "{\"choices\":[{\"message\":{\"content\":\"Hi from Gemini\"}}]}")
        }
        val engine = ProviderEngine(http)
        val providers = listOf(
            ProviderRegistry.byId("openrouter")!!,
            ProviderRegistry.byId("gemini")!!
        )
        val keys = mapOf("openrouter" to "k", "gemini" to "k")
        val first = engine.chat("hi", emptyList(), AiMode.FAST, providers, keys, emptyMap(), emptyMap(), null)
        assertEquals("gemini", first.providerId)
        assertEquals("Hi from Gemini", first.text)
        assertEquals(1, posts.count { it.contains("openrouter") })
        // Second call within 60 s must NOT retry the rate-limited provider.
        val second = engine.chat("hi again", emptyList(), AiMode.FAST, providers, keys, emptyMap(), emptyMap(), null)
        assertEquals("gemini", second.providerId)
        assertEquals(1, posts.count { it.contains("openrouter") })
        assertTrue(engine.isRateLimit("HTTP 429: quota exceeded"))
        assertTrue(engine.isRateLimit("resource_exhausted"))
        assertFalse(engine.isRateLimit("HTTP 500 internal error"))
    }

    @Test
    fun fenceStrippingCleansWholeFileOnly() {
        assertEquals("<html></html>", CodeCleaner.clean("```html\n<html></html>\n```"))
        assertEquals("const x = `hi`;\nconsole.log(x);", CodeCleaner.clean("const x = `hi`;\nconsole.log(x);"))
        val tmp = Files.createTempDirectory("rocky-fence").toFile()
        val tools = registry(tmp)
        val res = tools.execute(
            "create_file",
            mapOf("slug" to "p", "filename" to "index.html", "content" to "```html\n<html></html>\n```")
        )
        assertEquals(ToolStatus.DONE, res.status)
        assertEquals("<html></html>", tools.readProjectFile("p", "index.html"))
    }

    @Test
    fun taskHistoryCapsAt100OldestDropped() {
        val history = TaskHistory()
        for (i in 1..105) history.add(TaskStep(StepKind.PLAN_ONLY, "t$i", ""))
        assertEquals(100, history.size())
        assertEquals("t6", history.all().first().title)
        assertEquals("t105", history.all().last().title)
    }

    @Test
    fun systemPromptCarriesRoutingDiscipline() {
        val http = FakeHttp()
        var capturedBody = ""
        http.postHandler = { _, body ->
            capturedBody = body
            HttpResponse(200, "{\"choices\":[{\"message\":{\"content\":\"ok\"}}]}")
        }
        val engine = ProviderEngine(http)
        engine.chat(
            "hi", emptyList(), AiMode.FAST,
            listOf(ProviderRegistry.byId("openrouter")!!),
            mapOf("openrouter" to "k"), emptyMap(), emptyMap(), null
        )
        assertTrue(capturedBody.contains("research only when"))
        assertTrue(capturedBody.contains("Confirm before"))
        assertTrue(capturedBody.contains("calm, confident, futuristic"))
    }

    @Test
    fun parserHandlesLargeModelContentWithoutOverflow() {
        // Regression test for run 40141110116: a model plan whose file
        // contents are multi-KB HTML-like text with many quotes/colons.
        val chunk = (1..500).joinToString(" ") { "attr=\"$it\" style=\"color:red\" data-x=\"$it\"" }
        val content = "<html><body>$chunk</body></html>"
        val escaped = content.replace("\\", "\\\\").replace("\"", "\\\"")
        val json = """[{"tool":"create_file","args":{"slug":"p","filename":"index.html","content":"$escaped"}}]"""
        val calls = ToolCallParser.parseNested(json)
        assertEquals(1, calls.size)
        assertEquals("create_file", calls[0].first)
        assertEquals(content, calls[0].second["content"])
    }
}
