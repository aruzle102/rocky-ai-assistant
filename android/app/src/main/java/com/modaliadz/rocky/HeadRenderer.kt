package com.modaliadz.rocky

import android.opengl.GLES30
import android.opengl.GLSurfaceView
import android.opengl.Matrix
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

/**
 * NATIVE OpenGL ES 3.0 holographic head.
 *
 * The face is a REAL solid parametric mesh (brow ridge, nose bridge + tip,
 * cheek contours, chin, ears, neck), NOT a particle cloud. Particles are
 * ONLY a halo/energy field around the solid face. A separate jaw mesh
 * rotates open with speech. Eyes are glowing meshes with pupils, eyelids
 * (blink via Y scale) and gaze. This file contains no images, no stock
 * model, no flat illustration — all geometry is generated here.
 */
class HeadRenderer : GLSurfaceView.Renderer {
    @Volatile var state: RockyState = RockyState.INTRO
    @Volatile var amplitude: Float = 0f
    @Volatile var jawOpen: Float = 0f
    @Volatile var reducedEffects: Boolean = false
    @Volatile var form: Float = 0f // intro: 0 = scattered, 1 = fully formed

    private var meshProgram = 0
    private var pointProgram = 0
    private var ringProgram = 0
    private var headVbo = 0
    private var headIbo = 0
    private var headIndexCount = 0
    private var jawVbo = 0
    private var jawIbo = 0
    private var jawIndexCount = 0
    private var eyeVbo = 0
    private var eyeIbo = 0
    private var eyeIndexCount = 0
    private var haloVbo = 0
    private var haloScatterVbo = 0
    private var haloPhaseVbo = 0
    private var haloCount = 900
    private var ringVbo = 0
    private var ringIbo = 0
    private var ringIndexCount = 0

    private val proj = FloatArray(16)
    private val view = FloatArray(16)
    private val model = FloatArray(16)
    private val mvp = FloatArray(16)
    private val mv = FloatArray(16)
    private val tmp = FloatArray(16)

    private var lastTime = 0L
    private var time = 0f
    private var blink = 0f
    private var nextBlinkAt = 2.5f
    private var gazeX = 0f
    private var gazeY = 0f
    private var gazeTargetX = 0f
    private var gazeTargetY = 0f
    private var nextSaccadeAt = 1.5f
    private var fpsAccum = 0f
    private var fpsFrames = 0
    private var lowFpsTime = 0f
    private var qualityReduced = false
    private var curColor = floatArrayOf(0.19f, 0.48f, 1f)
    private var smoothAmp = 0f
    private var smoothJaw = 0f

    fun onTouchGaze(nx: Float, ny: Float) {
        gazeTargetX = nx.coerceIn(-1f, 1f)
        gazeTargetY = ny.coerceIn(-1f, 1f)
    }

    fun setQualityLow(low: Boolean) {
        qualityReduced = low
        haloCount = if (low) 350 else 900
    }

    // ---------- shader helpers ----------
    private fun compile(type: Int, src: String): Int {
        val id = GLES30.glCreateShader(type)
        GLES30.glShaderSource(id, src)
        GLES30.glCompileShader(id)
        return id
    }

    private fun link(vs: String, fs: String): Int {
        val p = GLES30.glCreateProgram()
        GLES30.glAttachShader(p, compile(GLES30.GL_VERTEX_SHADER, vs))
        GLES30.glAttachShader(p, compile(GLES30.GL_FRAGMENT_SHADER, fs))
        GLES30.glLinkProgram(p)
        return p
    }

    private fun floatBuffer(data: FloatArray): FloatBuffer =
        ByteBuffer.allocateDirect(data.size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer().apply {
            put(data); position(0)
        }

    private fun intBuffer(data: IntArray): java.nio.IntBuffer =
        ByteBuffer.allocateDirect(data.size * 4).order(ByteOrder.nativeOrder()).asIntBuffer().apply {
            put(data); position(0)
        }

    private fun makeVbo(data: FloatArray): Int {
        val ids = IntArray(1)
        GLES30.glGenBuffers(1, ids, 0)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, ids[0])
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, data.size * 4, floatBuffer(data), GLES30.GL_STATIC_DRAW)
        return ids[0]
    }

    private fun makeIbo(data: IntArray): Int {
        val ids = IntArray(1)
        GLES30.glGenBuffers(1, ids, 0)
        GLES30.glBindBuffer(GLES30.GL_ELEMENT_ARRAY_BUFFER, ids[0])
        GLES30.glBufferData(GLES30.GL_ELEMENT_ARRAY_BUFFER, data.size * 4, intBuffer(data), GLES30.GL_STATIC_DRAW)
        return ids[0]
    }

    // ---------- geometry ----------
    /** Parametric head: returns (positions+normals interleaved, indices). */
    private fun headGeometry(): Pair<FloatArray, IntArray> {
        val latSteps = 28; val lonSteps = 40
        val verts = mutableListOf<Float>()
        for (i in 0..latSteps) {
            val v = PI * i / latSteps
            val cosV = cos(v); val sinV = sin(v)
            for (j in 0..lonSteps) {
                val u = 2 * PI * j / lonSteps
                val cosU = cos(u); val sinU = sin(u)
                var x = (sinV * cosU * 0.82).toFloat()
                var y = (cosV * 1.15).toFloat()
                var z = (sinV * sinU * 0.92).toFloat()
                val front = max(0f, sinU.toFloat())
                // Brow ridge
                val brow = exp(-((y - 0.50f) * (y - 0.50f)) / 0.03f) * front
                z += brow * 0.05f
                // Nose bridge + tip: narrow band near x=0, y around 0.15, front only
                val nose = exp(-((y - 0.15f) * (y - 0.15f)) / 0.10f) *
                    exp(-(x * x) / 0.03f) * front
                z += nose * 0.30f
                // Cheek contours
                val cheek = exp(-((y + 0.25f) * (y + 0.25f)) / 0.12f) * front
                z += cheek * 0.04f
                // Chin taper
                if (y < -0.80f) {
                    val t = 1f - (-0.80f - y) * 0.45f
                    x *= t; z *= t
                }
                // Ears hint: push sides out near y=0
                if (kotlin.math.abs(cosU) > 0.92f && kotlin.math.abs(y) < 0.30f) x *= 1.14f
                // Neck taper at the bottom
                if (y < -1.0f) { x *= 0.55f; z *= 0.55f }
                verts.add(x); verts.add(y); verts.add(z)
                // Approx normal from the ellipsoid axes
                var nx = x / 0.82f; var ny = y / 1.15f; var nz = z / 0.92f
                val len = kotlin.math.sqrt(nx * nx + ny * ny + nz * nz).coerceAtLeast(0.0001f)
                nx /= len; ny /= len; nz /= len
                verts.add(nx); verts.add(ny); verts.add(nz)
            }
        }
        val idx = mutableListOf<Int>()
        val row = lonSteps + 1
        for (i in 0 until latSteps) {
            for (j in 0 until lonSteps) {
                val a = i * row + j; val b = a + 1; val c = a + row; val d = c + 1
                idx.add(a); idx.add(c); idx.add(b)
                idx.add(b); idx.add(c); idx.add(d)
            }
        }
        return verts.toFloatArray() to idx.toIntArray()
    }

    private fun jawGeometry(): Pair<FloatArray, IntArray> {
        // Lower-face shell, pivot at its top edge (y = -0.35 in head space).
        val latSteps = 10; val lonSteps = 28
        val verts = mutableListOf<Float>()
        for (i in 0..latSteps) {
            val t = i.toFloat() / latSteps // 0 top -> 1 bottom
            val y = -0.35f - t * 0.65f
            for (j in 0..lonSteps) {
                val u = 2 * PI * j / lonSteps
                val x = sin(u).toFloat() * 0.52f * (1f - t * 0.25f)
                val z = cos(u).toFloat() * 0.62f * (1f - t * 0.20f)
                verts.add(x); verts.add(y); verts.add(z)
                var nx = x / 0.52f; var ny = 0.2f; var nz = z / 0.62f
                val len = kotlin.math.sqrt(nx * nx + ny * ny + nz * nz).coerceAtLeast(0.0001f)
                verts.add(nx / len); verts.add(ny / len); verts.add(nz / len)
            }
        }
        val idx = mutableListOf<Int>(); val row = lonSteps + 1
        for (i in 0 until latSteps) for (j in 0 until lonSteps) {
            val a = i * row + j; val b = a + 1; val c = a + row; val d = c + 1
            idx.add(a); idx.add(b); idx.add(c); idx.add(b); idx.add(d); idx.add(c)
        }
        return verts.toFloatArray() to idx.toIntArray()
    }

    private fun sphereGeometry(radius: Float, latSteps: Int = 12, lonSteps: Int = 18): Pair<FloatArray, IntArray> {
        val verts = mutableListOf<Float>()
        for (i in 0..latSteps) {
            val v = PI * i / latSteps
            for (j in 0..lonSteps) {
                val u = 2 * PI * j / lonSteps
                val x = (sin(v) * cos(u) * radius).toFloat()
                val y = (cos(v) * radius).toFloat()
                val z = (sin(v) * sin(u) * radius).toFloat()
                verts.add(x); verts.add(y); verts.add(z)
                val len = kotlin.math.sqrt(x * x + y * y + z * z).coerceAtLeast(0.0001f)
                verts.add(x / len); verts.add(y / len); verts.add(z / len)
            }
        }
        val idx = mutableListOf<Int>(); val row = lonSteps + 1
        for (i in 0 until latSteps) for (j in 0 until lonSteps) {
            val a = i * row + j; val b = a + 1; val c = a + row; val d = c + 1
            idx.add(a); idx.add(c); idx.add(b); idx.add(b); idx.add(c); idx.add(d)
        }
        return verts.toFloatArray() to idx.toIntArray()
    }

    private fun ringGeometry(inner: Float, outer: Float, segments: Int = 72): Pair<FloatArray, IntArray> {
        val verts = mutableListOf<Float>()
        for (i in 0..segments) {
            val a = 2 * PI * i / segments
            verts.add((cos(a) * inner).toFloat()); verts.add(0f); verts.add((sin(a) * inner).toFloat())
            verts.add((cos(a) * outer).toFloat()); verts.add(0f); verts.add((sin(a) * outer).toFloat())
        }
        val idx = mutableListOf<Int>()
        for (i in 0 until segments) {
            val a = i * 2
            idx.add(a); idx.add(a + 1); idx.add(a + 2)
            idx.add(a + 1); idx.add(a + 3); idx.add(a + 2)
        }
        return verts.toFloatArray() to idx.toIntArray()
    }

    // ---------- GL setup ----------
    override fun onSurfaceCreated(unused: GL10?, config: EGLConfig?) {
        GLES30.glClearColor(0.02f, 0.04f, 0.08f, 1f)
        GLES30.glEnable(GLES30.GL_DEPTH_TEST)
        GLES30.glEnable(GLES30.GL_BLEND)
        GLES30.glBlendFunc(GLES30.GL_SRC_ALPHA, GLES30.GL_ONE_MINUS_SRC_ALPHA)
        val meshVs = """#version 300 es
            layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNorm;
            uniform mat4 uMVP; uniform mat4 uModel;
            out vec3 vNorm; out vec3 vPos;
            void main(){ vec4 wp = uModel * vec4(aPos,1.0); vPos = wp.xyz;
              vNorm = mat3(uModel) * aNorm; gl_Position = uMVP * vec4(aPos,1.0); }"""
        val meshFs = """#version 300 es
            precision mediump float;
            uniform vec3 uColor; uniform float uAlpha; uniform float uGlow;
            in vec3 vNorm; in vec3 vPos; out vec4 outColor;
            void main(){
              vec3 n = normalize(vNorm);
              vec3 lightDir = normalize(vec3(0.4, 0.7, 0.8));
              float diff = max(dot(n, lightDir), 0.0);
              vec3 viewDir = normalize(-vPos);
              float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
              vec3 col = uColor * (0.30 + 0.70 * diff) + uColor * fres * (1.0 + uGlow);
              outColor = vec4(col, uAlpha);
            }"""
        meshProgram = link(meshVs, meshFs)
        val pointVs = """#version 300 es
            layout(location=0) in vec3 aPos; layout(location=1) in vec3 aScatter; layout(location=2) in float aPhase;
            uniform mat4 uMVP; uniform float uTime; uniform float uAmp; uniform float uForm; uniform float uSize;
            out float vGlow;
            void main(){
              vec3 p = mix(aScatter, aPos, uForm);
              p.x += sin(uTime * 1.3 + aPhase) * 0.05 * (1.0 + uAmp);
              p.y += cos(uTime * 1.1 + aPhase * 1.7) * 0.05 * (1.0 + uAmp);
              vec4 mv = uMVP * vec4(p, 1.0);
              gl_Position = mv;
              gl_PointSize = uSize * (1.0 + uAmp * 0.8);
              vGlow = 0.55 + 0.45 * sin(uTime * 2.0 + aPhase);
            }"""
        val pointFs = """#version 300 es
            precision mediump float;
            uniform vec3 uColor; in float vGlow; out vec4 outColor;
            void main(){
              vec2 uv = gl_PointCoord - 0.5; float d = length(uv);
              if (d > 0.5) discard;
              float g = smoothstep(0.5, 0.0, d);
              outColor = vec4(uColor * (0.7 + 0.6 * vGlow), g * 0.9);
            }"""
        pointProgram = link(pointVs, pointFs)
        val ringVs = """#version 300 es
            layout(location=0) in vec3 aPos; uniform mat4 uMVP; void main(){ gl_Position = uMVP * vec4(aPos,1.0); }"""
        val ringFs = """#version 300 es
            precision mediump float; uniform vec3 uColor; uniform float uAlpha; out vec4 outColor;
            void main(){ outColor = vec4(uColor, uAlpha); }"""
        ringProgram = link(ringVs, ringFs)

        val (headVerts, headIdx) = headGeometry()
        headVbo = makeVbo(headVerts); headIbo = makeIbo(headIdx); headIndexCount = headIdx.size
        val (jawVerts, jawIdx) = jawGeometry()
        jawVbo = makeVbo(jawVerts); jawIbo = makeIbo(jawIdx); jawIndexCount = jawIdx.size
        val (eyeVerts, eyeIdx) = sphereGeometry(0.15f)
        eyeVbo = makeVbo(eyeVerts); eyeIbo = makeIbo(eyeIdx); eyeIndexCount = eyeIdx.size
        val (ringVerts, ringIdx) = ringGeometry(1.9f, 2.0f)
        ringVbo = makeVbo(ringVerts); ringIbo = makeIbo(ringIdx); ringIndexCount = ringIdx.size

        val rnd = Random(42)
        val halo = FloatArray(haloCount * 3); val scatter = FloatArray(haloCount * 3); val phase = FloatArray(haloCount)
        for (i in 0 until haloCount) {
            val th = rnd.nextFloat() * 2 * PI.toFloat(); val ph = rnd.nextFloat() * PI.toFloat()
            val r = 1.7f + rnd.nextFloat() * 0.9f
            halo[i * 3] = (sin(ph) * cos(th) * r).toFloat()
            halo[i * 3 + 1] = (cos(ph) * r * 1.1f).toFloat()
            halo[i * 3 + 2] = (sin(ph) * sin(th) * r).toFloat()
            scatter[i * 3] = (rnd.nextFloat() - 0.5f) * 8f
            scatter[i * 3 + 1] = (rnd.nextFloat() - 0.5f) * 7f
            scatter[i * 3 + 2] = (rnd.nextFloat() - 0.5f) * 4f - 1f
            phase[i] = rnd.nextFloat() * 2 * PI.toFloat()
        }
        haloVbo = makeVbo(halo); haloScatterVbo = makeVbo(scatter); haloPhaseVbo = makeVbo(phase)
        lastTime = System.nanoTime()
    }

    override fun onSurfaceChanged(unused: GL10?, width: Int, height: Int) {
        GLES30.glViewport(0, 0, width, height)
        val ratio = width.toFloat() / max(1, height).toFloat()
        Matrix.frustumM(proj, 0, -ratio, ratio, -1f, 1f, 1f, 30f)
        Matrix.setLookAtM(view, 0, 0f, 0.2f, 6.0f, 0f, -0.1f, 0f, 0f, 1f, 0f)
    }

    private fun drawMesh(program: Int, vbo: Int, ibo: Int, count: Int, modelM: FloatArray, color: FloatArray, alpha: Float, glow: Float) {
        GLES30.glUseProgram(program)
        Matrix.multiplyMM(mv, 0, view, 0, modelM, 0)
        Matrix.multiplyMM(mvp, 0, proj, 0, mv, 0)
        GLES30.glUniformMatrix4fv(GLES30.glGetUniformLocation(program, "uMVP"), 1, false, mvp, 0)
        GLES30.glUniformMatrix4fv(GLES30.glGetUniformLocation(program, "uModel"), 1, false, modelM, 0)
        GLES30.glUniform3f(GLES30.glGetUniformLocation(program, "uColor"), color[0], color[1], color[2])
        GLES30.glUniform1f(GLES30.glGetUniformLocation(program, "uAlpha"), alpha)
        GLES30.glUniform1f(GLES30.glGetUniformLocation(program, "uGlow"), glow)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, vbo)
        GLES30.glEnableVertexAttribArray(0)
        GLES30.glVertexAttribPointer(0, 3, GLES30.GL_FLOAT, false, 24, 0)
        GLES30.glEnableVertexAttribArray(1)
        GLES30.glVertexAttribPointer(1, 3, GLES30.GL_FLOAT, false, 24, 12)
        GLES30.glBindBuffer(GLES30.GL_ELEMENT_ARRAY_BUFFER, ibo)
        GLES30.glDrawElements(GLES30.GL_TRIANGLES, count, GLES30.GL_UNSIGNED_INT, 0)
        GLES30.glDisableVertexAttribArray(0); GLES30.glDisableVertexAttribArray(1)
    }

    override fun onDrawFrame(unused: GL10?) {
        val now = System.nanoTime()
        val dt = min(0.05f, (now - lastTime) / 1_000_000_000f)
        lastTime = now
        time += dt
        if (state == RockyState.INTRO && form < 1f) form = min(1f, form + dt / 4f)
        smoothAmp += (amplitude - smoothAmp) * 0.25f
        smoothJaw += (jawOpen - smoothJaw) * 0.35f
        // Blink cycle
        if (time >= nextBlinkAt) { blink = 1f; nextBlinkAt = time + 2.2f + Random.nextFloat() * 2.8f }
        else if (blink > 0f) blink = max(0f, blink - dt / 0.16f)
        // Idle saccades
        if (time >= nextSaccadeAt) {
            gazeTargetX = (Random.nextFloat() - 0.5f) * 0.9f
            gazeTargetY = (Random.nextFloat() - 0.5f) * 0.6f
            nextSaccadeAt = time + 1.4f + Random.nextFloat() * 2.0f
        }
        gazeX += (gazeTargetX - gazeX) * 0.08f
        gazeY += (gazeTargetY - gazeY) * 0.08f
        // Adaptive quality: sustained low FPS halves the halo
        fpsAccum += dt; fpsFrames++
        if (fpsFrames >= 120) {
            val avgFps = fpsFrames / max(0.001f, fpsAccum)
            fpsAccum = 0f; fpsFrames = 0
            if (avgFps < 24f) {
                lowFpsTime += 1f
                if (lowFpsTime >= 2f && !qualityReduced) { qualityReduced = true; haloCount = 350 }
            } else lowFpsTime = 0f
        }
        val target = when (state) {
            RockyState.IDLE -> floatArrayOf(0.19f, 0.48f, 1f)
            RockyState.LISTENING -> floatArrayOf(0.13f, 0.83f, 0.93f)
            RockyState.THINKING -> floatArrayOf(0.49f, 0.42f, 1f)
            RockyState.SPEAKING -> floatArrayOf(0.22f, 0.74f, 0.97f)
            RockyState.EXECUTING -> floatArrayOf(0f, 0.96f, 0.83f)
            RockyState.ERROR -> floatArrayOf(1f, 0.23f, 0.36f)
            RockyState.INTRO -> floatArrayOf(0.19f, 0.48f, 1f)
        }
        for (i in 0..2) curColor[i] += (target[i] - curColor[i]) * 0.12f

        GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT or GLES30.GL_DEPTH_BUFFER_BIT)
        val swayY = sin(time * 0.3f) * 0.10f
        val swayX = sin(time * 0.23f) * 0.04f
        val lean = if (state == RockyState.LISTENING) 0.08f else 0f
        Matrix.setIdentityM(model, 0)
        Matrix.translateM(model, 0, 0f, 0f, 0f)
        Matrix.rotateM(model, 0, (swayY * 57.3f), 0f, 1f, 0f)
        Matrix.rotateM(model, 0, ((swayX + lean) * 57.3f), 1f, 0f, 0f)
        val headScale = 0.55f + 0.45f * form
        Matrix.scaleM(model, 0, headScale, headScale, headScale)
        val alpha = 0.25f + 0.75f * form
        drawMesh(meshProgram, headVbo, headIbo, headIndexCount, model, curColor, alpha, smoothAmp)
        // Jaw: pivot at (0,-0.35,0) in head space — translate, rotate, translate back.
        Matrix.setIdentityM(tmp, 0)
        Matrix.translateM(tmp, 0, 0f, -0.35f, 0f)
        Matrix.rotateM(tmp, 0, -smoothJaw * 26f, 1f, 0f, 0f)
        Matrix.translateM(tmp, 0, 0f, 0.35f, 0f)
        val jawModel = FloatArray(16)
        Matrix.multiplyMM(jawModel, 0, model, 0, tmp, 0)
        drawMesh(meshProgram, jawVbo, jawIbo, jawIndexCount, jawModel, curColor, alpha, smoothAmp)
        // Eyes: glowing spheres + dark pupils, blink via Y scale, gaze offset.
        val blinkScale = 1f - blink * 0.85f
        for (side in listOf(-1f, 1f)) {
            val eyeModel = FloatArray(16)
            Matrix.setIdentityM(eyeModel, 0)
            Matrix.translateM(eyeModel, 0, side * 0.32f + gazeX * 0.05f, 0.28f + gazeY * 0.04f, 0.82f)
            Matrix.scaleM(eyeModel, 0, 1f, blinkScale, 1f)
            val combined = FloatArray(16)
            Matrix.multiplyMM(combined, 0, model, 0, eyeModel, 0)
            drawMesh(meshProgram, eyeVbo, eyeIbo, eyeIndexCount, combined, floatArrayOf(0.6f, 0.95f, 1f), alpha, 1.2f)
            val pupilModel = FloatArray(16)
            Matrix.setIdentityM(pupilModel, 0)
            Matrix.translateM(pupilModel, 0, side * 0.32f + gazeX * 0.07f, 0.28f + gazeY * 0.05f, 0.94f)
            Matrix.scaleM(pupilModel, 0, 0.45f, 0.45f * blinkScale, 0.45f)
            val pupilCombined = FloatArray(16)
            Matrix.multiplyMM(pupilCombined, 0, model, 0, pupilModel, 0)
            drawMesh(meshProgram, eyeVbo, eyeIbo, eyeIndexCount, pupilCombined, floatArrayOf(0.02f, 0.05f, 0.12f), alpha, 0f)
        }
        // Halo particles (never the face itself)
        if (!reducedEffects || haloCount > 0) {
            GLES30.glUseProgram(pointProgram)
            Matrix.setIdentityM(tmp, 0)
            Matrix.multiplyMM(mv, 0, view, 0, tmp, 0)
            Matrix.multiplyMM(mvp, 0, proj, 0, mv, 0)
            GLES30.glUniformMatrix4fv(GLES30.glGetUniformLocation(pointProgram, "uMVP"), 1, false, mvp, 0)
            GLES30.glUniform1f(GLES30.glGetUniformLocation(pointProgram, "uTime"), time)
            GLES30.glUniform1f(GLES30.glGetUniformLocation(pointProgram, "uAmp"), smoothAmp)
            GLES30.glUniform1f(GLES30.glGetUniformLocation(pointProgram, "uForm"), form)
            GLES30.glUniform1f(GLES30.glGetUniformLocation(pointProgram, "uSize"), if (qualityReduced) 5f else 7f)
            GLES30.glUniform3f(GLES30.glGetUniformLocation(pointProgram, "uColor"), curColor[0], curColor[1], curColor[2])
            GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, haloVbo)
            GLES30.glEnableVertexAttribArray(0)
            GLES30.glVertexAttribPointer(0, 3, GLES30.GL_FLOAT, false, 0, 0)
            GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, haloScatterVbo)
            GLES30.glEnableVertexAttribArray(1)
            GLES30.glVertexAttribPointer(1, 3, GLES30.GL_FLOAT, false, 0, 0)
            GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, haloPhaseVbo)
            GLES30.glEnableVertexAttribArray(2)
            GLES30.glVertexAttribPointer(2, 1, GLES30.GL_FLOAT, false, 0, 0)
            GLES30.glDrawArrays(GLES30.GL_POINTS, 0, haloCount)
            GLES30.glDisableVertexAttribArray(0); GLES30.glDisableVertexAttribArray(1); GLES30.glDisableVertexAttribArray(2)
        }
        // Ground energy ring
        GLES30.glUseProgram(ringProgram)
        Matrix.setIdentityM(tmp, 0)
        Matrix.translateM(tmp, 0, 0f, -2.4f, 0f)
        Matrix.scaleM(tmp, 0, 1f + smoothAmp * 0.3f, 1f, 1f + smoothAmp * 0.3f)
        Matrix.multiplyMM(mv, 0, view, 0, tmp, 0)
        Matrix.multiplyMM(mvp, 0, proj, 0, mv, 0)
        GLES30.glUniformMatrix4fv(GLES30.glGetUniformLocation(ringProgram, "uMVP"), 1, false, mvp, 0)
        GLES30.glUniform3f(GLES30.glGetUniformLocation(ringProgram, "uColor"), curColor[0], curColor[1], curColor[2])
        GLES30.glUniform1f(GLES30.glGetUniformLocation(ringProgram, "uAlpha"), 0.35f + smoothAmp * 0.4f)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, ringVbo)
        GLES30.glEnableVertexAttribArray(0)
        GLES30.glVertexAttribPointer(0, 3, GLES30.GL_FLOAT, false, 0, 0)
        GLES30.glBindBuffer(GLES30.GL_ELEMENT_ARRAY_BUFFER, ringIbo)
        GLES30.glDrawElements(GLES30.GL_TRIANGLES, ringIndexCount, GLES30.GL_UNSIGNED_INT, 0)
        GLES30.glDisableVertexAttribArray(0)
    }
}
