package com.modaliadz.rocky

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View
import kotlin.math.sin

/** Simple waveform bar view driven by the current speech/listening amplitude. */
class AmplitudeView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null
) : View(context, attrs) {
    @Volatile var amplitude: Float = 0f
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF22D3EE.toInt() }
    private var phase = 0f

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        phase += 0.25f
        val bars = 28
        val w = width.toFloat() / bars
        val mid = height / 2f
        for (i in 0 until bars) {
            val h = 2f + amplitude * 22f * (0.5f + 0.5f * sin(i * 0.9f + phase).toFloat())
            val left = i * w + 1f
            canvas.drawRect(left, mid - h, left + w - 3f, mid + h, paint)
        }
        if (amplitude > 0.01f) postInvalidateDelayed(100)
    }
}
