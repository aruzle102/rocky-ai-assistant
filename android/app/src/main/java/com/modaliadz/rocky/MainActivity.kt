package com.modaliadz.rocky

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import android.opengl.GLSurfaceView
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.sin

class MainActivity : AppCompatActivity() {
    private lateinit var glView: GLSurfaceView
    private lateinit var renderer: HeadRenderer
    private lateinit var chatList: RecyclerView
    private lateinit var chatAdapter: ChatAdapter
    private lateinit var taskAdapter: TaskAdapter
    private lateinit var statusPill: TextView
    private lateinit var noticeText: TextView
    private lateinit var inputText: EditText
    private lateinit var amplitudeView: AmplitudeView
    private lateinit var introOverlay: View
    private lateinit var tasksPanel: LinearLayout
    private lateinit var micButton: Button
    private lateinit var muteButton: Button

    private lateinit var store: MemoryStore
    private lateinit var tts: RockyTts
    private lateinit var speech: SpeechInput
    private lateinit var engine: ProviderEngine
    private val sfx = Sfx()
    private val backNav = BackNavigator()
    private val handler = Handler(Looper.getMainLooper())
    private val messages = mutableListOf<ChatMessage>()
    private var listening = false
    private var muted = false
    private var currentState: RockyState = RockyState.INTRO
    private var aiCancelled = AtomicBoolean(false)
    private var lastUserText = ""
    private var pendingAgentResult: AgentResult? = null
    private var pendingPreviewSlug: String? = null
    private val agentSteps = TaskHistory()

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) startListening() else showNotice(getString(R.string.mic_permission_needed))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Swap the splash theme for the app theme before content is drawn.
        setTheme(R.style.Theme_Rocky)
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        store = MemoryStore(this)
        engine = ProviderEngine(RealHttpClient())
        sfx.enabled = store.sfxEnabled

        glView = findViewById(R.id.glView)
        renderer = HeadRenderer()
        renderer.reducedEffects = store.reducedEffects
        renderer.setQualityLow(store.quality == "Low")
        glView.setEGLContextClientVersion(3)
        glView.setRenderer(renderer)
        glView.setOnTouchListener { v, ev ->
            if (ev.action == MotionEvent.ACTION_MOVE || ev.action == MotionEvent.ACTION_DOWN) {
                val nx = (ev.x / v.width.toFloat()) * 2f - 1f
                val ny = -((ev.y / v.height.toFloat()) * 2f - 1f)
                renderer.onTouchGaze(nx, ny)
            }
            true
        }

        statusPill = findViewById(R.id.statusPill)
        noticeText = findViewById(R.id.noticeText)
        inputText = findViewById(R.id.inputText)
        amplitudeView = findViewById(R.id.amplitudeView)
        introOverlay = findViewById(R.id.introOverlay)
        tasksPanel = findViewById(R.id.tasksPanel)
        micButton = findViewById(R.id.micButton)
        muteButton = findViewById(R.id.muteButton)

        chatList = findViewById(R.id.chatList)
        chatList.layoutManager = LinearLayoutManager(this)
        messages.addAll(store.loadHistory())
        if (messages.isEmpty()) {
            messages.add(ChatMessage("rocky", getString(R.string.empty_history)))
        }
        chatAdapter = ChatAdapter(messages)
        chatList.adapter = chatAdapter

        val taskList = findViewById<RecyclerView>(R.id.taskList)
        taskList.layoutManager = LinearLayoutManager(this)
        taskAdapter = TaskAdapter(mutableListOf())
        taskList.adapter = taskAdapter

        tts = RockyTts(this)
        tts.listener = object : RockyTts.Listener {
            override fun onWord(start: Int, end: Int) {
                renderer.jawOpen = JawMapper.jawForWord(end - start)
            }
            override fun onEnvelope(a: Float) {
                renderer.amplitude = a
                amplitudeView.amplitude = a
            }
            override fun onDone() {
                renderer.jawOpen = 0f
                renderer.amplitude = 0f
                amplitudeView.amplitude = 0f
                val pending = pendingAgentResult
                if (pending != null) {
                    pendingAgentResult = null
                    deliverAgentResult(pending)
                } else if (pendingPreviewSlug != null) {
                    val slug = pendingPreviewSlug
                    pendingPreviewSlug = null
                    setState(RockyState.IDLE)
                    startActivity(Intent(this, PreviewActivity::class.java).putExtra("slug", slug))
                } else {
                    setState(RockyState.IDLE)
                }
            }
            override fun onError(message: String) {
                showNotice(message)
                setState(RockyState.IDLE)
            }
        }
        speech = SpeechInput(this)
        speech.listener = object : SpeechInput.Listener {
            override fun onPartial(text: String) { inputText.setText(text) }
            override fun onFinal(text: String) {
                listening = false
                micButton.text = "🎤"
                send(text)
            }
            override fun onError(message: String) {
                listening = false
                micButton.text = "🎤"
                showNotice(message)
                sfx.error()
                setState(RockyState.ERROR)
                handler.postDelayed({ if (currentState == RockyState.ERROR) setState(RockyState.IDLE) }, 2500)
            }
        }

        findViewById<Button>(R.id.skipIntroButton).setOnClickListener { finishIntro() }
        micButton.setOnClickListener { toggleMic() }
        muteButton.setOnClickListener {
            muted = !muted
            muteButton.text = if (muted) "Unmute" else "Mute"
            if (muted) { tts.stop(); setState(RockyState.IDLE) }
        }
        findViewById<Button>(R.id.sendButton).setOnClickListener { send(inputText.text.toString()) }
        findViewById<Button>(R.id.stopButton).setOnClickListener { stopAll() }
        findViewById<Button>(R.id.settingsButton).setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
        findViewById<Button>(R.id.projectsButton).setOnClickListener {
            startActivity(Intent(this, ProjectsActivity::class.java))
        }
        findViewById<Button>(R.id.tasksButton).setOnClickListener {
            val show = tasksPanel.visibility != View.VISIBLE
            tasksPanel.visibility = if (show) View.VISIBLE else View.GONE
            backNav.panelOpen = show
        }
        findViewById<Button>(R.id.runTaskButton).setOnClickListener { runTask() }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when (backNav.onBack()) {
                    BackAction.SKIP_INTRO -> finishIntro()
                    BackAction.CLOSE_PANEL -> {
                        tasksPanel.visibility = View.GONE
                        backNav.panelOpen = false
                    }
                    BackAction.EXIT -> finish()
                }
            }
        })

        // Amplitude pulse while listening (SpeechRecognizer gives no RMS stream;
        // this pulse is a listening indicator, not claimed microphone audio).
        handler.post(object : Runnable {
            override fun run() {
                if (currentState == RockyState.LISTENING) {
                    val a = 0.25f + 0.15f * sin(System.currentTimeMillis() / 300.0).toFloat()
                    renderer.amplitude = a
                    amplitudeView.amplitude = a
                    handler.postDelayed(this, 150)
                } else {
                    handler.postDelayed(this, 500)
                }
            }
        })

        if (!store.introSeen) {
            startIntro()
        } else {
            renderer.form = 1f
            introOverlay.visibility = View.GONE
            setState(RockyState.IDLE)
        }

        // Emulator-demo hook ONLY: when launched with an intent extra
        // "demo_question", send it automatically after the intro. Normal
        // launches never carry this extra, so users are never affected.
        // Used by the CI emulator demo job to show a typed (not spoken —
        // emulators have no real mic) request end to end.
        intent.getStringExtra("demo_question")?.let { demo ->
            handler.postDelayed({ send(demo) }, 6500)
        }
    }

    private fun startIntro() {
        setState(RockyState.INTRO)
        backNav.introShowing = true
        introOverlay.visibility = View.VISIBLE
        renderer.form = 0f
        sfx.hum()
        handler.postDelayed({ if (currentState == RockyState.INTRO) finishIntro() }, 4500)
    }

    private fun finishIntro() {
        renderer.form = 1f
        introOverlay.visibility = View.GONE
        backNav.introShowing = false
        store.introSeen = true
        setState(RockyState.IDLE)
    }

    private fun setState(s: RockyState) {
        currentState = s
        renderer.state = s
        statusPill.text = when (s) {
            RockyState.INTRO -> getString(R.string.status_intro)
            RockyState.IDLE -> getString(R.string.status_idle)
            RockyState.LISTENING -> getString(R.string.status_listening)
            RockyState.THINKING -> getString(R.string.status_thinking)
            RockyState.SPEAKING -> getString(R.string.status_speaking)
            RockyState.EXECUTING -> getString(R.string.status_executing)
            RockyState.ERROR -> getString(R.string.status_error)
        }
    }

    private fun showNotice(msg: String) {
        noticeText.text = msg
        noticeText.visibility = View.VISIBLE
        handler.postDelayed({ noticeText.visibility = View.GONE }, 6000)
    }

    private fun addMessage(role: String, text: String, provider: String = "") {
        val m = ChatMessage(role, text, provider)
        chatAdapter.add(m)
        chatList.scrollToPosition(messages.size - 1)
        store.saveHistory(messages.filter { it.text != getString(R.string.empty_history) })
    }

    private fun toggleMic() {
        if (listening) {
            speech.stop()
            listening = false
            micButton.text = "🎤"
            setState(RockyState.IDLE)
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            return
        }
        startListening()
    }

    private fun startListening() {
        if (!speech.isAvailable()) {
            showNotice(getString(R.string.recognition_unavailable))
            return
        }
        listening = true
        micButton.text = "■"
        setState(RockyState.LISTENING)
        sfx.listeningChime()
        val lang = when (store.language) {
            "auto" -> ""
            else -> store.language
        }
        speech.start(lang)
    }

    private fun stopAll() {
        aiCancelled.set(true)
        tts.stop()
        speech.stop()
        listening = false
        micButton.text = "🎤"
        renderer.jawOpen = 0f
        renderer.amplitude = 0f
        setState(RockyState.IDLE)
    }

    private fun mode(): AiMode = try {
        AiMode.valueOf(store.mode)
    } catch (_: Exception) { AiMode.SMART_AUTO }

    private fun send(raw: String) {
        val text = raw.trim()
        if (text.isEmpty()) return
        // Interruption: stop any current speech before handling the new input.
        tts.stop()
        speech.stop()
        listening = false
        micButton.text = "🎤"
        inputText.setText("")
        lastUserText = text
        addMessage("user", text)
        aiCancelled.set(false)

        // Autonomous-agent trigger: spoken "build a website / restaurant" runs
        // the agent (audible acknowledgement -> generate -> validate -> preview).
        val lower = text.lowercase()
        if (lower.contains("build") && (lower.contains("website") || lower.contains("restaurant") || lower.contains("site"))) {
            runAgent(text)
            return
        }

        // Task requests from voice OR text go to the REAL task engine, not
        // to a chat-only answer. Research uses the real web_research tool
        // and cites what was actually found (source in the report).
        if (lower.startsWith("create file") || lower.startsWith("create note") ||
            lower.startsWith("remind") || lower.startsWith("open ") ||
            lower.startsWith("research") || lower.startsWith("deep research") ||
            lower.startsWith("search:") || lower.startsWith("search ")) {
            val taskText = when {
                lower.startsWith("search:") -> "research: " + text.substringAfter(":").trim()
                lower.startsWith("search ") -> "research: " + text.substring(7).trim()
                else -> text
            }
            runChatTask(taskText)
            return
        }

        // Compare trigger: "compare: <question>" asks 2 providers and shows both.
        if (text.startsWith("compare:", ignoreCase = true)) {
            val q = text.substringAfter(":").trim()
            setState(RockyState.THINKING)
            Thread {
                try {
                    val compareHistory = messages.filter { it.role == "user" || it.role == "rocky" }.takeLast(20)
                    val res = engine.compare(q, compareHistory, store.providersWithOverrides(), store.keysMap(), store.accountsMap(), store.modelsMap())
                    runOnUiThread {
                        res.first?.let { addMessage("rocky", "[${it.providerId}] ${it.text}", it.providerId) }
                        res.second?.let { addMessage("rocky", "[${it.providerId}] ${it.text}", it.providerId) }
                        addMessage("rocky", res.synthesis)
                        speak(res.synthesis)
                    }
                } catch (e: Exception) {
                    runOnUiThread { showNotice("Compare failed: ${e.message}"); setState(RockyState.ERROR) }
                }
            }.start()
            return
        }

        setState(RockyState.THINKING)
        Thread {
            try {
                val m = mode()
                val reply: String
                val providerLabel: String
                if (m == AiMode.OFFLINE) {
                    val local = LocalTools.answer(text, store.userName)
                    if (local != null && local.startsWith("MEMORY_NOTE:")) {
                        val note = local.removePrefix("MEMORY_NOTE:")
                        val nameMatch = Regex("(?:my name is|je m'appelle)\\s+(.+)", RegexOption.IGNORE_CASE).find(note)
                        if (nameMatch != null) store.userName = nameMatch.groupValues[1].trim()
                        else store.addNote(note)
                        reply = "Noted — I will remember that on this phone."
                    } else {
                        reply = local ?: LocalTools.offlineMessage()
                    }
                    providerLabel = "local"
                } else {
                    // ONE BRAIN: every turn carries the conversation history
                    // (last 20 turns, so follow-ups work) plus, only when the
                    // user enabled it, their user-controlled memory entries.
                    // History is the current session context; stored memory
                    // entries stay on-device unless the toggle is ON.
                    val history = messages.filter { it.role == "user" || it.role == "rocky" }.takeLast(20)
                    val memText = if (store.memoryInCloud) {
                        store.cappedMemory().all().joinToString("\n") { "${it.category}: ${it.key} = ${it.value}" }
                    } else ""
                    val prompt = if (memText.isNotBlank()) {
                        "User-controlled memory:\n$memText\n\nUser request: $text"
                    } else text
                    val res = engine.chat(
                        prompt, history, m, store.providersWithOverrides(),
                        store.keysMap(), store.accountsMap(), store.modelsMap(), store.preferredProvider
                    )
                    reply = res.text
                    providerLabel = res.providerId
                }
                if (aiCancelled.get()) return@Thread
                runOnUiThread {
                    addMessage("rocky", reply, providerLabel)
                    speak(reply)
                }
            } catch (e: Exception) {
                if (aiCancelled.get()) return@Thread
                runOnUiThread {
                    showNotice("AI error: ${e.message}")
                    sfx.error()
                    setState(RockyState.ERROR)
                    handler.postDelayed({ if (currentState == RockyState.ERROR) setState(RockyState.IDLE) }, 3000)
                }
            }
        }.start()
    }

    private fun runChatTask(taskText: String) {
        setState(RockyState.EXECUTING)
        Thread {
            // Deep research: multi-query, source-grounded, cancellable.
            if (taskText.startsWith("deep research:", ignoreCase = true)) {
                val q = taskText.substringAfter(":").trim()
                val tools = ToolRegistry(java.io.File(filesDir, "projects"), store, store, RealResearchClient(), aiCancelled)
                val res = tools.execute("deep_research", mapOf("query" to q, "depth" to "standard"))
                runOnUiThread {
                    addMessage("rocky", res.output)
                    if (res.status == ToolStatus.DONE) {
                        speak(res.output.take(600))
                    } else {
                        showNotice(res.output)
                        setState(RockyState.ERROR)
                    }
                }
                return@Thread
            }
            val steps = TaskEngine.planFor(taskText)
            val report = TaskEngine.execute(steps, store, store, RealResearchClient())
            runOnUiThread {
                addMessage("rocky", report)
                // Fire real http(s) intents for OPEN_URL steps (verified by TaskEngine).
                for (s in steps) {
                    if (s.detail.startsWith("OPEN_URL:")) {
                        val url = s.detail.removePrefix("OPEN_URL:")
                        try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Exception) { }
                    }
                }
                val spoken = steps.joinToString(" ") { it.detail }.take(600)
                if (spoken.isNotBlank()) speak(spoken) else setState(RockyState.IDLE)
            }
        }.start()
    }

    private fun runAgent(goal: String) {
        val tools = ToolRegistry(java.io.File(filesDir, "projects"), store, store, RealResearchClient(), aiCancelled)
        agentSteps.clear()
        tasksPanel.visibility = View.VISIBLE
        backNav.panelOpen = true
        val ack = "Building your restaurant website now. I will generate the files, validate them, and show you a preview."
        addMessage("rocky", ack)
        val usable = try {
            engine.orderCandidates(store.providersWithOverrides(), store.keysMap(), mode())
        } catch (_: Exception) { emptyList() }
        val modelClient: ModelClient? = if (mode() == AiMode.OFFLINE || usable.isEmpty()) {
            null // scaffold fallback, labelled as such in the result message
        } else {
            object : ModelClient {
                override fun generate(prompt: String): String {
                    return engine.chat(
                        prompt, emptyList(), mode(), store.providersWithOverrides(),
                        store.keysMap(), store.accountsMap(), store.modelsMap(), store.preferredProvider
                    ).text
                }
            }
        }
        // Speak the acknowledgement first; the agent runs in parallel and its
        // result is delivered when speech finishes (or immediately if muted).
        speak(ack)
        Thread {
            val runtime = AgentRuntime(tools) { step ->
                runOnUiThread {
                    val mapped = when (step.status) {
                        AgentStepStatus.DONE -> StepStatus.DONE
                        AgentStepStatus.FAILED -> StepStatus.FAILED
                        else -> StepStatus.PENDING
                    }
                    agentSteps.add(TaskStep(StepKind.PLAN_ONLY, "${step.tool} — ${step.status}", "", mapped, step.output))
                    taskAdapter.setAll(agentSteps.all())
                }
            }
            val agentHistory = messages.filter { it.role == "user" || it.role == "rocky" }.takeLast(10)
            val agentMemory = if (store.memoryInCloud) {
                store.cappedMemory().all().joinToString("\n") { "${it.category}: ${it.key} = ${it.value}" }
            } else ""
            val result = runtime.run(goal, modelClient, aiCancelled, agentHistory, agentMemory)
            runOnUiThread {
                if (currentState == RockyState.SPEAKING) {
                    pendingAgentResult = result
                } else {
                    deliverAgentResult(result)
                }
            }
        }.start()
    }

    private fun deliverAgentResult(result: AgentResult) {
        addMessage("rocky", result.message, if (result.generatedByModel) "agent-model" else "agent-scaffold")
        if (result.success) {
            // Website = files + validation + preview. Files and validation
            // are done; the preview screen opens next (after speech, so
            // the spoken summary is not cut off; immediately if TTS is off).
            sfx.success()
            val slug = result.projectSlug
            if (slug != null && tts.ready && !muted) {
                pendingPreviewSlug = slug
                speak("Done. Your restaurant website is ready — files validated. Opening the preview next.")
            } else if (slug != null) {
                speak("Done. Your restaurant website is ready — files validated.")
                startActivity(Intent(this, PreviewActivity::class.java).putExtra("slug", slug))
            } else {
                speak("Done. Your restaurant website is ready — files validated.")
            }
        } else {
            sfx.error()
            speak("The website build is incomplete. Check the step log in Tasks for the exact error.")
        }
    }

    private fun speak(text: String) {
        if (muted) {
            setState(RockyState.IDLE)
            return
        }
        setState(RockyState.SPEAKING)
        tts.setVoice(store.voiceName, languageTag(), store.pitch, store.rate)
        if (!tts.speak(text)) {
            showNotice(getString(R.string.tts_unavailable))
            setState(RockyState.IDLE)
        }
    }

    private fun languageTag(): String = when (store.language) {
        "auto" -> ""
        "ar-DZ", "ar-SA", "fr-FR", "en-US" -> store.language
        else -> ""
    }

    private fun runTask() {
        val input = findViewById<EditText>(R.id.taskInput).text.toString().trim()
        if (input.isEmpty()) {
            Toast.makeText(this, "Type a task first", Toast.LENGTH_SHORT).show()
            return
        }
        val steps = TaskEngine.planFor(input)
        taskAdapter.setAll(steps)
        setState(RockyState.EXECUTING)
        Thread {
            val report = TaskEngine.execute(steps, store, store, RealResearchClient())
            val openUrl = steps.firstOrNull { it.detail.startsWith("OPEN_URL:") }?.detail?.removePrefix("OPEN_URL:")
            runOnUiThread {
                taskAdapter.setAll(steps)
                addMessage("rocky", report)
                if (openUrl != null) {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(openUrl)))
                    } catch (_: Exception) {
                        showNotice("Could not open $openUrl")
                    }
                }
                sfx.success()
                setState(RockyState.IDLE)
            }
        }.start()
    }

    override fun onResume() {
        super.onResume()
        glView.onResume()
        renderer.reducedEffects = store.reducedEffects
        sfx.enabled = store.sfxEnabled
    }

    override fun onPause() {
        tts.stop()
        super.onPause()
        glView.onPause()
    }

    override fun onDestroy() {
        tts.shutdown()
        speech.stop()
        super.onDestroy()
    }
}
