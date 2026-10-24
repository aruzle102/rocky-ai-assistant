package com.modaliadz.rocky

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.atomic.AtomicBoolean

class LocalToolsTest {
    @Test
    fun calculatorRespectsPrecedence() {
        assertEquals("2 + 3 * 4 = 14", LocalTools.answer("calculate 2 + 3 * 4", ""))
        assertEquals("(2 + 3) * 4 = 20", LocalTools.answer("calculate (2 + 3) * 4", ""))
    }

    @Test
    fun conversionWorks() {
        val out = LocalTools.answer("10 km to miles", "")
        assertTrue(out != null && out.contains("6.2137"))
    }

    @Test
    fun unknownQueryReturnsNull() {
        assertNull(LocalTools.answer("tell me a story about dragons", ""))
    }

    @Test
    fun identityIsHonestLocal() {
        val out = LocalTools.answer("who are you", "")
        assertTrue(out != null && out.contains("local mode"))
    }
}

class JawMapperTest {
    @Test
    fun longerWordOpensWider() {
        assertTrue(JawMapper.jawForWord(10) > JawMapper.jawForWord(2))
    }

    @Test
    fun envelopeStartsPositiveEndsZero() {
        assertTrue(JawMapper.envelope(0, 10000, 5) > 0f)
        assertEquals(0f, JawMapper.envelope(10000, 10000, 5))
        assertEquals(0f, JawMapper.envelope(20000, 10000, 5))
    }

    @Test
    fun envelopeAlwaysInRange() {
        for (t in 0L..10000L step 500L) {
            val v = JawMapper.envelope(t, 10000, 8)
            assertTrue(v in 0f..1f)
        }
    }
}

class BackNavigatorTest {
    @Test
    fun introTakesPrecedence() {
        val nav = BackNavigator()
        nav.introShowing = true; nav.panelOpen = true
        assertEquals(BackAction.SKIP_INTRO, nav.onBack())
    }

    @Test
    fun panelClosesBeforeExit() {
        val nav = BackNavigator()
        nav.panelOpen = true
        assertEquals(BackAction.CLOSE_PANEL, nav.onBack())
        nav.panelOpen = false
        assertEquals(BackAction.EXIT, nav.onBack())
    }
}
