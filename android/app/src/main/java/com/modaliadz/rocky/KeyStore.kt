package com.modaliadz.rocky

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Provider keys: EncryptedSharedPreferences when it can be created,
 * otherwise app-private SharedPreferences (fallback, disclosed in
 * Settings and in BUILD_REPORT). Keys are NEVER in source, bundle,
 * logs or GitHub, and are masked in the UI.
 * (JARVIS-adapted: core/secret_store.py + api_key_validator.py pattern —
 * encrypted per-user keys, validated by a models-list call before chat.)
 */
class KeyStore(context: Context) {
    val encrypted: Boolean
    private val prefs: SharedPreferences

    init {
        var enc: SharedPreferences? = null
        var ok = false
        try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            enc = EncryptedSharedPreferences.create(
                context, "rocky-keys",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
            ok = true
        } catch (_: Exception) {
            ok = false
        }
        encrypted = ok
        prefs = enc ?: context.getSharedPreferences("rocky-keys-fallback", Context.MODE_PRIVATE)
    }

    fun get(id: String): String? = try { prefs.getString("key_$id", null) } catch (_: Exception) { null }
    fun set(id: String, value: String) {
        try { prefs.edit().putString("key_$id", value).apply() } catch (_: Exception) { }
    }
    fun all(): Map<String, String> {
        return try {
            prefs.all.entries
                .filter { it.key.startsWith("key_") && it.value is String }
                .associate { it.key.removePrefix("key_") to (it.value as String) }
        } catch (_: Exception) { emptyMap() }
    }
    fun clear() {
        try { prefs.edit().clear().apply() } catch (_: Exception) { }
    }
}
