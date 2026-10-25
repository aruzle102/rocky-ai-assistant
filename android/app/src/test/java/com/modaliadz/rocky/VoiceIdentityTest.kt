package com.modaliadz.rocky

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceIdentityTest {
    @Test
    fun systemPromptNamesRockyAndForbidsBrandConfusion() {
        assertTrue(RockyIdentity.SYSTEM_PROMPT.contains("ROCKY"))
        assertTrue(RockyIdentity.SYSTEM_PROMPT.contains("Your name is ROCKY"))
        assertTrue(RockyIdentity.SYSTEM_PROMPT.contains("never present the underlying model's brand"))
    }

    @Test
    fun pollinationsPromptCarriesIdentityHistoryAndUser() {
        val history = listOf(ChatMessage("user", "I like tea"), ChatMessage("rocky", "Noted."))
        val encoded = RockyIdentity.pollinationsPrompt(history, "", "What is your name?")
        assertFalse(encoded.contains(" "))
        assertFalse(encoded.contains("\n"))
        // URL-decoded, the prompt must contain identity + history + question.
        val decoded = java.net.URLDecoder.decode(encoded, "UTF-8")
        assertTrue(decoded.contains("ROCKY"))
        assertTrue(decoded.contains("I like tea"))
        assertTrue(decoded.contains("What is your name?"))
    }

    @Test
    fun chatMessagesCarrySystemHistoryAndUser() {
        val history = listOf(ChatMessage("user", "hello"))
        val msgs = RockyIdentity.chatMessages(history, "", "follow up?")
        assertTrue(msgs.contains("\"role\":\"system\""))
        assertTrue(msgs.contains("ROCKY"))
        assertTrue(msgs.contains("hello"))
        assertTrue(msgs.contains("follow up?"))
    }

    @Test
    fun pollinationsAttemptSendsIdentityNotRawPrompt() {
        var capturedUrl = ""
        val http = FakeHttp()
        http.getHandler = { url -> capturedUrl = url; HttpResponse(200, "I am ROCKY") }
        val engine = ProviderEngine(http)
        val res = engine.attempt(
            ProviderRegistry.byId("pollinations")!!, "", "", "openai-fast",
            "What is your name?", listOf(ChatMessage("user", "earlier topic"))
        )
        assertEquals("I am ROCKY", res)
        val decoded = java.net.URLDecoder.decode(capturedUrl.substringAfter("https://text.pollinations.ai/"), "UTF-8")
        assertTrue(decoded.contains("ROCKY"))
        assertTrue(decoded.contains("earlier topic"))
        assertTrue(decoded.contains("What is your name?"))
    }

    @Test
    fun englishDominantDetection() {
        assertTrue(RockyIdentity.isEnglishDominant("Hello, how are you today?"))
        assertFalse(RockyIdentity.isEnglishDominant("مرحبا، كيف حالك اليوم؟"))
        assertFalse(RockyIdentity.isEnglishDominant(""))
    }

    @Test
    fun maleVoicePickPrefersMaleMarkedVoice() {
        val names = listOf(
            "en-us-x-sfg#female_1-local",
            "en-us-x-sfg#male_1-local",
            "en-us-x-sfg#female_2-local"
        )
        assertEquals("en-us-x-sfg#male_1-local", VoicePick.pickMaleVoice(names))
        assertNull(VoicePick.pickMaleVoice(listOf("en-us-x-sfg#female_1-local")))
        assertNull(VoicePick.pickMaleVoice(emptyList()))
    }

    @Test
    fun visemeMappingEnglishAndArabic() {
        assertEquals(listOf(Viseme.E, Viseme.O), VisemeMapper.forWord("hello"))
        assertTrue(VisemeMapper.forWord("restaurant").isNotEmpty())
        assertTrue(VisemeMapper.forText("مرحبا").isNotEmpty())
        assertTrue(VisemeMapper.forText("").contains(Viseme.NEUTRAL))
    }

    @Test
    fun piperAssetConstants() {
        assertTrue(PiperTts.MODEL_ASSET.endsWith(".onnx"))
        assertTrue(PiperTts.TOKENS_ASSET.endsWith("tokens.txt"))
        assertTrue(PiperTts.VOICE_NAME.contains("Piper"))
    }
}
