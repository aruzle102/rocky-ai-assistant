package com.modaliadz.rocky

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlin.math.sin

/**
 * Generated sound design — no audio files, no copyrighted material.
 * All tones are synthesised with AudioTrack. Mute/sfx toggles are honoured.
 */
class Sfx {
    @Volatile var enabled: Boolean = true
    @Volatile var volume: Float = 0.8f

    private fun play(freqs: List<Double>, durationMs: Int, vol: Float) {
        if (!enabled) return
        Thread {
            try {
                val rate = 22050
                val frames = rate * durationMs / 1000
                val buf = ShortArray(frames)
                for (i in 0 until frames) {
                    val t = i.toDouble() / rate
                    val fade = minOf(1.0, i / (rate * 0.02), (frames - i) / (rate * 0.08))
                    var s = 0.0
                    for (f in freqs) s += sin(2 * Math.PI * f * t) / freqs.size
                    buf[i] = (s * 12000 * vol * volume * fade).toInt().toShort()
                }
                // Classic AudioTrack constructor: setBufferSizeInFrames is
                // not available on AudioTrack.Builder on every API level, and
                // the builder call failed compilation (run 40140687239).
                // Buffer size is frames * 2 bytes (16-bit mono).
                @Suppress("DEPRECATION")
                val track = AudioTrack(
                    android.media.AudioManager.STREAM_MUSIC, rate,
                    AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT,
                    frames * 2, AudioTrack.MODE_STATIC
                )
                track.write(buf, 0, frames)
                track.play()
                Thread.sleep(durationMs.toLong() + 50)
                track.release()
            } catch (_: Exception) {
                // Sound must never crash the app.
            }
        }.start()
    }

    fun hum() = play(listOf(110.0, 165.0), 1200, 0.5f)
    fun tap() = play(listOf(880.0), 80, 0.6f)
    fun listeningChime() = play(listOf(660.0, 990.0), 220, 0.6f)
    fun success() = play(listOf(523.0, 784.0), 260, 0.6f)
    fun error() = play(listOf(220.0, 165.0), 300, 0.6f)
}
