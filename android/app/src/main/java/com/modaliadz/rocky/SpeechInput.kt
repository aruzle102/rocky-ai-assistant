package com.modaliadz.rocky

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import java.util.Locale

/**
 * System Android SpeechRecognizer (not Web Speech). Partial results are
 * shown live; errors are mapped to clear, retryable messages.
 */
class SpeechInput(context: Context) {
    interface Listener {
        fun onPartial(text: String)
        fun onFinal(text: String)
        fun onError(message: String)
    }

    var listener: Listener? = null
    private var recognizer: SpeechRecognizer? = null
    private val appContext = context.applicationContext

    fun isAvailable(): Boolean = try {
        SpeechRecognizer.isRecognitionAvailable(appContext)
    } catch (_: Exception) { false }

    fun start(languageTag: String) {
        stop()
        if (!isAvailable()) {
            listener?.onError("Speech recognition is not available on this device. Type your message instead.")
            return
        }
        val rec = SpeechRecognizer.createSpeechRecognizer(appContext)
        recognizer = rec
        rec.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onError(error: Int) {
                val msg = when (error) {
                    SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT ->
                        "Network error during recognition. Check the connection and retry."
                    SpeechRecognizer.ERROR_NO_MATCH ->
                        "I did not catch that. Please speak again or type your message."
                    SpeechRecognizer.ERROR_SPEECH_TIMEOUT ->
                        "Listening timed out. Tap the microphone and try again."
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
                        "Microphone permission is missing. Grant it in Android Settings, then try again."
                    SpeechRecognizer.ERROR_AUDIO, SpeechRecognizer.ERROR_CLIENT ->
                        "Microphone error. Try again."
                    else -> "Recognition error ($error). Try again or type your message."
                }
                listener?.onError(msg)
            }
            override fun onResults(results: Bundle?) {
                val list = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val text = list?.firstOrNull() ?: ""
                if (text.isNotBlank()) listener?.onFinal(text)
            }
            override fun onPartialResults(partialResults: Bundle?) {
                val list = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val text = list?.firstOrNull() ?: ""
                if (text.isNotBlank()) listener?.onPartial(text)
            }
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, languageTag.ifBlank { Locale.getDefault().toLanguageTag() })
        }
        try {
            rec.startListening(intent)
        } catch (e: Exception) {
            listener?.onError("Could not start recognition: ${e.message}")
        }
    }

    fun stop() {
        try { recognizer?.stopListening() } catch (_: Exception) { }
        try { recognizer?.cancel() } catch (_: Exception) { }
        try { recognizer?.destroy() } catch (_: Exception) { }
        recognizer = null
    }
}
