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
                val track = AudioTrack.Builder()
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
                    )
                    .setAudioFormat(
                        AudioFormat.Builder()
                            .setSampleRate(rate).setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build()
                    )
                    .setBufferSizeInFrames(frames)
                    .setTransferMode(AudioTrack.MODE_STATIC).build()
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
