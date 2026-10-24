package com.modaliadz.rocky

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.SeekBar
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.util.Locale

class SettingsActivity : AppCompatActivity() {
    private lateinit var store: MemoryStore
    private lateinit var engine: ProviderEngine
    private var tts: TextToSpeech? = null
    private var voiceNames: List<String> = emptyList()
    private lateinit var providerAdapter: ProviderAdapter
    private lateinit var discoverResult: TextView
    private lateinit var providerNote: TextView

    private val languages = listOf(
        "Auto (device language)" to "auto",
        "Arabic — Algeria (ar-DZ)" to "ar-DZ",
        "Arabic — Saudi (ar-SA)" to "ar-SA",
        "French (fr-FR)" to "fr-FR",
        "English (en-US)" to "en-US"
    )
    private val modes = listOf("SMART_AUTO", "FAST", "DEEP", "OFFLINE")
    private val qualities = listOf("High", "Balanced", "Low")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)
        store = MemoryStore(this)
        engine = ProviderEngine(RealHttpClient())
        discoverResult = findViewById(R.id.discoverResult)
        providerNote = findViewById(R.id.providerNote)

        val voiceSpinner = findViewById<Spinner>(R.id.voiceSpinner)
        val languageSpinner = findViewById<Spinner>(R.id.languageSpinner)
        val modeSpinner = findViewById<Spinner>(R.id.modeSpinner)
        val qualitySpinner = findViewById<Spinner>(R.id.qualitySpinner)
        val providerSpinner = findViewById<Spinner>(R.id.providerSpinner)
        val pitchBar = findViewById<SeekBar>(R.id.pitchBar)
        val rateBar = findViewById<SeekBar>(R.id.rateBar)
        val sfxCheck = findViewById<CheckBox>(R.id.sfxCheck)
        val reducedCheck = findViewById<CheckBox>(R.id.reducedCheck)
        val memoryCheck = findViewById<CheckBox>(R.id.memoryCloudCheck)
        val baseUrlInput = findViewById<EditText>(R.id.baseUrlInput)
        val modelInput = findViewById<EditText>(R.id.modelInput)
        val apiKeyInput = findViewById<EditText>(R.id.apiKeyInput)
        val accountInput = findViewById<EditText>(R.id.accountInput)

        languageSpinner.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, languages.map { it.first })
        languageSpinner.setSelection(languages.indexOfFirst { it.second == store.language }.coerceAtLeast(0))
        modeSpinner.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, modes)
        modeSpinner.setSelection(modes.indexOf(store.mode).coerceAtLeast(0))
        qualitySpinner.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, qualities)
        qualitySpinner.setSelection(qualities.indexOf(store.quality).coerceAtLeast(0))
        providerSpinner.adapter = ArrayAdapter(
            this, android.R.layout.simple_spinner_dropdown_item,
            ProviderRegistry.builtIn.map { it.name }
        )

        pitchBar.progress = ((store.pitch - 0.5f) / 0.7f * 100).toInt().coerceIn(0, 100)
        rateBar.progress = ((store.rate - 0.7f) / 0.6f * 100).toInt().coerceIn(0, 100)
        sfxCheck.isChecked = store.sfxEnabled
        reducedCheck.isChecked = store.reducedEffects
        memoryCheck.isChecked = store.memoryInCloud

        fun refreshProviderFields() {
            val p = ProviderRegistry.builtIn[providerSpinner.selectedItemPosition]
            baseUrlInput.setText(store.providerBaseUrl(p.id).ifBlank { p.baseUrl })
            modelInput.setText(store.providerModel(p.id).ifBlank { p.defaultModel })
            apiKeyInput.setText(store.providerKey(p.id))
            accountInput.setText(store.providerAccount(p.id))
            providerNote.text = "${p.name} — ${p.status}. ${p.setupNote} Free limits: ${p.freeNote} " +
                "Algeria access is NOT verified from this build environment — confirm on your phone."
        }
        providerSpinner.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: android.widget.AdapterView<*>?, v: android.view.View?, pos: Int, id: Long) = refreshProviderFields()
            override fun onNothingSelected(parent: android.widget.AdapterView<*>?) {}
        }
        refreshProviderFields()

        val providerList = findViewById<RecyclerView>(R.id.providerList)
        providerList.layoutManager = LinearLayoutManager(this)
        fun healthMap(): Map<String, ProviderHealth> {
            val map = mutableMapOf<String, ProviderHealth>()
            for (p in ProviderRegistry.builtIn) {
                val h = engine.healthOf(p.id)
                h.enabled = store.providerEnabled(p.id)
                map[p.id] = h
            }
            return map
        }
        providerAdapter = ProviderAdapter(
            ProviderRegistry.builtIn, healthMap(),
            onTest = { p -> testProvider(p) },
            onToggle = { p ->
                val cur = store.providerEnabled(p.id)
                store.setProviderEnabled(p.id, !cur)
                providerAdapter = ProviderAdapter(ProviderRegistry.builtIn, healthMap(),
                    onTest = { pp -> testProvider(pp) },
                    onToggle = { pp ->
                        store.setProviderEnabled(pp.id, !store.providerEnabled(pp.id))
                        providerList.adapter = providerAdapter
                    })
                providerList.adapter = providerAdapter
            }
        )
        providerList.adapter = providerAdapter

        // Real device voices (async TTS init).
        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                voiceNames = try { tts?.voices?.map { it.name }?.sorted() ?: emptyList() } catch (_: Exception) { emptyList() }
                runOnUiThread {
                    voiceSpinner.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, voiceNames)
                    val idx = voiceNames.indexOf(store.voiceName)
                    if (idx >= 0) voiceSpinner.setSelection(idx)
                }
            }
        }

        findViewById<Button>(R.id.testVoiceButton).setOnClickListener {
            val voice = if (voiceSpinner.selectedItem != null) voiceSpinner.selectedItem.toString() else null
            val pitch = 0.5f + pitchBar.progress / 100f * 0.7f
            val rate = 0.7f + rateBar.progress / 100f * 0.6f
            val tester = RockyTts(this)
            tester.listener = object : RockyTts.Listener {
                override fun onWord(s: Int, e: Int) {}
                override fun onEnvelope(a: Float) {}
                override fun onDone() { tester.shutdown() }
                override fun onError(m: String) { tester.shutdown() }
            }
            // Give TTS a moment to initialise, then speak the test line.
            tester.let {
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    it.setVoice(voice, store.language, pitch, rate)
                    if (!it.speak("Hello. I am ROCKY, calm, direct, and ready.")) {
                        Toast.makeText(this, "Speech output is not available on this device", Toast.LENGTH_LONG).show()
                    }
                }, 600)
            }
        }

        findViewById<Button>(R.id.discoverButton).setOnClickListener {
            val p = ProviderRegistry.builtIn[providerSpinner.selectedItemPosition]
            discoverResult.text = "Discovering models for ${p.name}…"
            Thread {
                try {
                    val ids = engine.discoverModels(p, store.providerKey(p.id))
                    runOnUiThread { discoverResult.text = "Found ${ids.size} models: ${ids.take(12).joinToString(", ")}" }
                } catch (e: Exception) {
                    runOnUiThread { discoverResult.text = "Discovery failed: ${e.message}" }
                }
            }.start()
        }

        findViewById<Button>(R.id.clearHistoryButton).setOnClickListener {
            store.clearHistory()
            Toast.makeText(this, "Conversation history cleared", Toast.LENGTH_SHORT).show()
        }
        findViewById<Button>(R.id.clearMemoryButton).setOnClickListener {
            store.clearMemory()
            store.clearCappedMemory()
            Toast.makeText(this, "Memory cleared", Toast.LENGTH_SHORT).show()
        }
        findViewById<Button>(R.id.exportButton).setOnClickListener {
            val share = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, store.historyText().ifBlank { "No conversation history." })
            }
            startActivity(Intent.createChooser(share, "Export ROCKY history"))
        }
        findViewById<Button>(R.id.replayIntroButton).setOnClickListener {
            store.introSeen = false
            Toast.makeText(this, "Intro will play on the next launch", Toast.LENGTH_SHORT).show()
        }

        val permStatus = findViewById<TextView>(R.id.permissionStatus)
        val micOk = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        permStatus.text = "Microphone permission: ${if (micOk) "GRANTED" else "NOT GRANTED — grant it in Android Settings > Apps > ROCKY AI > Permissions"}. " +
            "Speech recognition and TTS depend on this device's speech services. " +
            "Keys stored: ${if (store.keysEncrypted) "encrypted (EncryptedSharedPreferences)" else "app-private fallback (encryption unavailable on this device)"}."

        findViewById<Button>(R.id.saveButton).setOnClickListener {
            val voice = if (voiceSpinner.selectedItem != null) voiceSpinner.selectedItem.toString() else null
            store.voiceName = voice
            store.pitch = 0.5f + pitchBar.progress / 100f * 0.7f
            store.rate = 0.7f + rateBar.progress / 100f * 0.6f
            store.language = languages[languageSpinner.selectedItemPosition].second
            store.mode = modes[modeSpinner.selectedItemPosition]
            store.quality = qualities[qualitySpinner.selectedItemPosition]
            store.sfxEnabled = sfxCheck.isChecked
            store.reducedEffects = reducedCheck.isChecked
            store.memoryInCloud = memoryCheck.isChecked
            val p = ProviderRegistry.builtIn[providerSpinner.selectedItemPosition]
            store.setProviderBaseUrl(p.id, baseUrlInput.text.toString().trim())
            store.setProviderModel(p.id, modelInput.text.toString().trim())
            store.setProviderKey(p.id, apiKeyInput.text.toString().trim())
            store.setProviderAccount(p.id, accountInput.text.toString().trim())
            store.preferredProvider = p.id
            Toast.makeText(this, "Settings saved", Toast.LENGTH_SHORT).show()
            finish()
        }
        findViewById<Button>(R.id.closeButton).setOnClickListener { finish() }
    }

    private fun testProvider(p: Provider) {
        discoverResult.text = "Validating ${p.name} key via its models list, then testing with a real prompt…"
        Thread {
            try {
                // Key validation FIRST (JARVIS api_key_validator pattern):
                // list models before any chat call. Providers without a
                // models endpoint skip straight to the chat test.
                if (p.modelsUrl != null) {
                    val ids = try {
                        engine.discoverModels(p, store.providerKey(p.id))
                    } catch (e: Exception) {
                        throw RuntimeException("Key validation via models list failed: ${e.message}")
                    }
                    runOnUiThread { discoverResult.text = "Key validated for ${p.name}: ${ids.size} models listed. Now testing with a real prompt…" }
                }
                val start = System.currentTimeMillis()
                val res = engine.chat(
                    "Say OK in one word.", emptyList(), AiMode.SMART_AUTO,
                    store.providersWithOverrides(), store.keysMap(), store.accountsMap(), store.modelsMap(), p.id
                )
                val latency = System.currentTimeMillis() - start
                runOnUiThread {
                    discoverResult.text = "Test OK via ${res.providerId} (${res.model}, ${latency} ms): ${res.text}"
                }
            } catch (e: Exception) {
                runOnUiThread { discoverResult.text = "Test failed for ${p.name}: ${e.message}" }
            }
        }.start()
    }

    override fun onDestroy() {
        try { tts?.shutdown() } catch (_: Exception) { }
        super.onDestroy()
    }

    @Suppress("unused")
    private fun localeFor(tag: String): Locale = when (tag) {
        "ar-DZ" -> Locale("ar", "DZ")
        "fr-FR" -> Locale.FRENCH
        else -> Locale.US
    }
}
