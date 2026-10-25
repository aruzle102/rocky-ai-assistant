package com.modaliadz.rocky

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * App-private storage only. API keys live here (never in source, bundle,
 * logs or GitHub) and are masked in the UI. This is Android app-private
 * storage (sandbox), not hardware-backed encryption — see README.
 */
class MemoryStore(context: Context) : FileStore, NoteStore {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("rocky-prefs", Context.MODE_PRIVATE)
    private val filesDir: File = context.filesDir
    private val keyStore = KeyStore(context)

    /** True when keys are in EncryptedSharedPreferences; false = app-private fallback. */
    val keysEncrypted: Boolean get() = keyStore.encrypted

    // --- simple prefs ---
    var userName: String
        get() = prefs.getString("user_name", "") ?: ""
        set(v) = prefs.edit().putString("user_name", v).apply()
    var notes: String
        get() = prefs.getString("notes", "") ?: ""
        set(v) = prefs.edit().putString("notes", v).apply()
    var language: String
        get() = prefs.getString("language", "auto") ?: "auto"
        set(v) = prefs.edit().putString("language", v).apply()
    var voiceName: String?
        get() = prefs.getString("voice_name", null)
        set(v) = prefs.edit().putString("voice_name", v).apply()
    var pitch: Float
        get() = prefs.getFloat("pitch", 0.8f)
        set(v) = prefs.edit().putFloat("pitch", v).apply()
    var rate: Float
        get() = prefs.getFloat("rate", 1.0f)
        set(v) = prefs.edit().putFloat("rate", v).apply()
    var mode: String
        get() = prefs.getString("mode", "SMART_AUTO") ?: "SMART_AUTO"
        set(v) = prefs.edit().putString("mode", v).apply()
    var sfxEnabled: Boolean
        get() = prefs.getBoolean("sfx", true)
        set(v) = prefs.edit().putBoolean("sfx", v).apply()
    var reducedEffects: Boolean
        get() = prefs.getBoolean("reduced", false)
        set(v) = prefs.edit().putBoolean("reduced", v).apply()
    var quality: String
        get() = prefs.getString("quality", "High") ?: "High"
        set(v) = prefs.edit().putString("quality", v).apply()
    var memoryInCloud: Boolean
        get() = prefs.getBoolean("memory_cloud", false)
        set(v) = prefs.edit().putBoolean("memory_cloud", v).apply()
    var introSeen: Boolean
        get() = prefs.getBoolean("intro_seen", false)
        set(v) = prefs.edit().putBoolean("intro_seen", v).apply()
    var preferredProvider: String?
        get() = prefs.getString("preferred_provider", null)
        set(v) = prefs.edit().putString("preferred_provider", v).apply()
    /** Voice engine: "piper" (ROCKY Voice, offline male, English) or "system". */
    var voiceEngine: String
        get() = prefs.getString("voice_engine", "piper") ?: "piper"
        set(v) = prefs.edit().putString("voice_engine", v).apply()
    /** Last deep-research result, shown in the Research view. */
    var lastResearchQuery: String
        get() = prefs.getString("last_research_query", "") ?: ""
        set(v) = prefs.edit().putString("last_research_query", v).apply()
    var lastResearchSummary: String
        get() = prefs.getString("last_research_summary", "") ?: ""
        set(v) = prefs.edit().putString("last_research_summary", v).apply()
    var lastResearchSources: String
        get() = prefs.getString("last_research_sources", "") ?: ""
        set(v) = prefs.edit().putString("last_research_sources", v).apply()

    // --- provider credentials: encrypted store first, legacy app-private
    // prefs as read-through fallback (writes always go to the key store) ---
    fun providerKey(id: String): String =
        keyStore.get(id) ?: (prefs.getString("key_$id", "") ?: "")
    fun setProviderKey(id: String, v: String) {
        keyStore.set(id, v)
        prefs.edit().remove("key_$id").apply()
    }

    // --- capped categorized memory (identity / preferences / projects /
    // relationships / wishes / notes; 380 chars per value, 2200 total) ---
    fun cappedMemory(): CappedMemory {
        val m = CappedMemory()
        m.fromJson(prefs.getString("capped_memory", "[]") ?: "[]")
        return m
    }
    fun saveCappedMemory(m: CappedMemory) =
        prefs.edit().putString("capped_memory", m.toJson()).apply()
    fun clearCappedMemory() = prefs.edit().remove("capped_memory").apply()
    fun providerModel(id: String): String = prefs.getString("model_$id", "") ?: ""
    fun setProviderModel(id: String, v: String) = prefs.edit().putString("model_$id", v).apply()
    fun providerBaseUrl(id: String): String = prefs.getString("base_$id", "") ?: ""
    fun setProviderBaseUrl(id: String, v: String) = prefs.edit().putString("base_$id", v).apply()
    fun providerAccount(id: String): String = prefs.getString("account_$id", "") ?: ""
    fun setProviderAccount(id: String, v: String) = prefs.edit().putString("account_$id", v).apply()
    fun providerEnabled(id: String, default: Boolean = true): Boolean =
        prefs.getBoolean("enabled_$id", default)
    fun setProviderEnabled(id: String, v: Boolean) = prefs.edit().putBoolean("enabled_$id", v).apply()

    fun keysMap(): Map<String, String> =
        ProviderRegistry.builtIn.associate { it.id to providerKey(it.id) }
    fun modelsMap(): Map<String, String> =
        ProviderRegistry.builtIn.associate { it.id to providerModel(it.id) }
    fun accountsMap(): Map<String, String> =
        ProviderRegistry.builtIn.associate { it.id to providerAccount(it.id) }
    fun providersWithOverrides(): List<Provider> = ProviderRegistry.builtIn.map { p ->
        val base = providerBaseUrl(p.id)
        if (base.isNotBlank()) p.copy(baseUrl = base) else p
    }

    // --- conversation history (JSON array in prefs, max 100) ---
    fun loadHistory(): MutableList<ChatMessage> {
        val out = mutableListOf<ChatMessage>()
        try {
            val arr = JSONArray(prefs.getString("history", "[]") ?: "[]")
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                out.add(ChatMessage(o.optString("role"), o.optString("text"), o.optString("provider"), o.optLong("at")))
            }
        } catch (_: Exception) { }
        return out
    }

    fun saveHistory(messages: List<ChatMessage>) {
        try {
            val arr = JSONArray()
            for (m in messages.takeLast(100)) {
                arr.put(JSONObject().apply {
                    put("role", m.role); put("text", m.text); put("provider", m.provider); put("at", m.at)
                })
            }
            prefs.edit().putString("history", arr.toString()).apply()
        } catch (_: Exception) { }
    }

    fun clearHistory() = prefs.edit().remove("history").apply()
    fun clearMemory() {
        userName = ""; notes = ""
    }

    fun historyText(): String = loadHistory().joinToString("\n") { m ->
        "${if (m.role == "user") "YOU" else "ROCKY"}: ${m.text}"
    }

    // --- FileStore (internal filesDir ONLY, verified by read-back in
    // TaskEngine; canonical safe-root check rejects any escape) ---
    private fun safeFile(name: String): File? {
        return try {
            val root = filesDir.canonicalFile
            val f = File(root, name).canonicalFile
            if (f == root || f.path.startsWith(root.path + File.separator)) f else null
        } catch (_: Exception) { null }
    }

    override fun write(name: String, content: String): Boolean {
        return try {
            val f = safeFile(name) ?: return false
            f.writeText(content)
            true
        } catch (_: Exception) { false }
    }

    override fun read(name: String): String? {
        return try {
            val f = safeFile(name) ?: return null
            if (f.exists()) f.readText() else null
        } catch (_: Exception) { null }
    }

    // --- NoteStore (in-app only; reminders are NOT system alarms) ---
    override fun addNote(text: String): Boolean {
        return try {
            notes = (if (notes.isBlank()) text else notes + "\n" + text)
            true
        } catch (_: Exception) { false }
    }

    override fun addReminder(text: String, whenText: String): Boolean {
        return try {
            val all = prefs.getString("reminders", "") ?: ""
            prefs.edit().putString("reminders", if (all.isBlank()) text else all + "\n" + text).apply()
            true
        } catch (_: Exception) { false }
    }

    fun reminders(): List<String> =
        (prefs.getString("reminders", "") ?: "").lines().filter { it.isNotBlank() }
}
