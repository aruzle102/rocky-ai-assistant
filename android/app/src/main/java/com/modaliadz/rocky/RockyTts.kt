package com.modaliadz.rocky

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import java.util.Locale

/**
 * System Android TTS (not Web Speech). Word ranges come from
 * UtteranceProgressListener.onRangeStart (API 26+). HONEST LIMIT: Android
 * TTS gives word ranges, not phonemes, so jaw motion is word/syllable
 * synchronised, not phoneme-perfect.
 */
class RockyTts(context: Context) {
    interface Listener {
        fun onWord(start: Int, end: Int)
        fun onEnvelope(a: Float)
        fun onDone()
        fun onError(message: String)
    }

    var listener: Listener? = null
    var ready: Boolean = false
        private set
    var voices: List<Voice> = emptyList()
        private set

    private val handler = Handler(Looper.getMainLooper())
    private var envelopeRunnable: Runnable? = null
    private var speakStartMs = 0L
    private var estimatedMs = 0L
    private var wordCount = 1

    private lateinit var tts: TextToSpeech

    init {
        tts = TextToSpeech(context) { status ->
        if (status == TextToSpeech.SUCCESS) {
            ready = true
            try { voices = tts.voices?.toList() ?: emptyList() } catch (_: Exception) { voices = emptyList() }
            tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {
                    speakStartMs = System.currentTimeMillis()
                    startEnvelope()
                }
                override fun onDone(utteranceId: String?) {
                    stopEnvelope()
                    handler.post { listener?.onEnvelope(0f); listener?.onDone() }
                }
                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) {
                    stopEnvelope()
                    handler.post { listener?.onError("Speech output failed") }
                }
                override fun onError(utteranceId: String?, errorCode: Int) {
                    stopEnvelope()
                    handler.post { listener?.onError("Speech output failed (code $errorCode)") }
                }
                override fun onRangeStart(utteranceId: String?, start: Int, end: Int, frame: Int) {
                    handler.post { listener?.onWord(start, end) }
                }
            })
        } else {
            ready = false
        }
        }
    }

    fun setVoice(voiceName: String?, languageTag: String, pitch: Float, rate: Float) {
        if (!ready) return
        try {
            val locale = when (languageTag) {
                "ar-DZ" -> Locale("ar", "DZ")
                "ar-SA" -> Locale("ar", "SA")
                "fr-FR" -> Locale.FRENCH
                "en-US" -> Locale.US
                else -> Locale.getDefault()
            }
            val res = tts.setLanguage(locale)
            if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts.setLanguage(Locale.US)
            }
            val voice = voiceName?.let { name -> voices.find { it.name == name } }
            if (voice != null) tts.voice = voice
            tts.setPitch(pitch.coerceIn(0.5f, 2f))
            tts.setSpeechRate(rate.coerceIn(0.5f, 2f))
        } catch (_: Exception) {
            // Keep defaults; speaking will still be attempted.
        }
    }

    fun speak(text: String): Boolean {
        if (!ready) return false
        wordCount = text.split("\\s+".toRegex()).size.coerceAtLeast(1)
        // Rough estimate: ~2.6 words/sec at rate 1.0, adjusted by the caller via rate in setVoice.
        estimatedMs = (wordCount / 2.6 * 1000).toLong() + 400
        val params = Bundle()
        return try {
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, "rocky-utterance") == TextToSpeech.SUCCESS
        } catch (_: Exception) { false }
    }

    fun stop() {
        try { tts.stop() } catch (_: Exception) { }
        stopEnvelope()
    }

    fun shutdown() {
        stop()
        try { tts.shutdown() } catch (_: Exception) { }
    }

    private fun startEnvelope() {
        stopEnvelope()
        val r = object : Runnable {
            override fun run() {
                val elapsed = System.currentTimeMillis() - speakStartMs
                val a = JawMapper.envelope(elapsed, estimatedMs, wordCount)
                handler.post { listener?.onEnvelope(a) }
                if (elapsed < estimatedMs) handler.postDelayed(this, 100)
            }
        }
        envelopeRunnable = r
        handler.post(r)
    }

    private fun stopEnvelope() {
        envelopeRunnable?.let { handler.removeCallbacks(it) }
        envelopeRunnable = null
    }
}
