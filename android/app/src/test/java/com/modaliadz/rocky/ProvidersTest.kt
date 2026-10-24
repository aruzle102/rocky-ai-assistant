package com.modaliadz.rocky

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class ProvidersTest {
    private fun providers(): List<Provider> = listOf(
        ProviderRegistry.byId("pollinations")!!,
        ProviderRegistry.byId("openrouter")!!
    )

    @Test
    fun failover_firstFailsSecondSucceeds() {
        val http = FakeHttp()
        http.getHandler = { HttpResponse(500, "error") }
        http.postHandler = { _, _ ->
            HttpResponse(200, "{\"choices\":[{\"message\":{\"content\":\"Hello from OpenRouter\"}}]}")
        }
        val engine = ProviderEngine(http)
        val res = engine.chat(
            "hi", emptyList(), AiMode.FAST, providers(),
            mapOf("openrouter" to "test-key"), emptyMap(), emptyMap(), null
        )
        assertEquals("openrouter", res.providerId)
        assertEquals("Hello from OpenRouter", res.text)
        assertEquals(2, res.attempts.size)
    }

    @Test
    fun failover_capsAtThreeAttempts() {
        val http = FakeHttp()
        http.getHandler = { HttpResponse(500, "e") }
        http.postHandler = { _, _ -> HttpResponse(500, "e") }
        val engine = ProviderEngine(http)
        val all = ProviderRegistry.builtIn
        try {
            engine.chat("hi", emptyList(), AiMode.FAST, all, mapOf(
                "openrouter" to "k", "gemini" to "k", "groq" to "k",
                "mistral" to "k", "cloudflare" to "k", "sambanova" to "k"
            ), emptyMap(), emptyMap(), null)
            fail("expected failure")
        } catch (e: RuntimeException) {
            assertTrue(e.message!!.contains("All providers failed"))
        }
        assertEquals(3, http.getCount + http.postCount)
    }

    @Test
    fun threeConsecutiveFailuresAutoDisables() {
        val http = FakeHttp()
        http.getHandler = { HttpResponse(500, "e") }
        http.postHandler = { _, _ -> HttpResponse(500, "e") }
        val engine = ProviderEngine(http)
        val all = ProviderRegistry.builtIn
        val keys = mapOf(
            "openrouter" to "k", "gemini" to "k", "groq" to "k",
            "mistral" to "k", "cloudflare" to "k", "sambanova" to "k"
        )
        repeat(3) {
            try { engine.chat("hi", emptyList(), AiMode.FAST, all, keys, emptyMap(), emptyMap(), null) } catch (_: Exception) { }
        }
        assertTrue(engine.healthOf("pollinations").autoDisabled)
    }

    @Test
    fun pollinationsKeylessSuccess() {
        val http = FakeHttp()
        http.getResponse = HttpResponse(200, "42")
        val engine = ProviderEngine(http)
        val res = engine.chat(
            "17+25", emptyList(), AiMode.FAST,
            listOf(ProviderRegistry.byId("pollinations")!!), emptyMap(), emptyMap(), emptyMap(), null
        )
        assertEquals("42", res.text)
    }

    @Test
    fun discoverOpenRouterFreeModels() {
        val http = FakeHttp()
        http.getResponse = HttpResponse(200, "{\"data\":[{\"id\":\"a:free\"},{\"id\":\"b\"}]}")
        val engine = ProviderEngine(http)
        val ids = engine.discoverModels(ProviderRegistry.byId("openrouter")!!, "")
        assertEquals(listOf("a:free"), ids)
    }
}
