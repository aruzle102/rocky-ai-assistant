package com.modaliadz.rocky

import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * Live task / workflow console: conversation log, notes, reminders and
 * provider status. Provider health counters are per-session in the main
 * activity's engine, so this view honestly shows registry status, free
 * limits and enabled state (not invented counters), plus the real log.
 */
class ConsoleActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_console)
        val store = MemoryStore(this)
        val log = findViewById<TextView>(R.id.consoleLog)
        val providers = findViewById<TextView>(R.id.consoleProviders)
        val history = store.loadHistory()
        log.text = if (history.isEmpty()) {
            "No conversation yet."
        } else {
            history.joinToString("\n\n") { m -> "${m.role.uppercase()}: ${m.text}" }
        }
        val notes = store.notes
        val reminders = store.reminders()
        val extra = buildString {
            if (notes.isNotBlank()) append("\n\nNOTES:\n").append(notes)
            if (reminders.isNotEmpty()) append("\n\nREMINDERS (in-app only):\n").append(reminders.joinToString("\n"))
        }
        if (extra.isNotBlank()) log.append(extra)
        providers.text = ProviderRegistry.builtIn.joinToString("\n\n") { p ->
            val enabled = if (store.providerEnabled(p.id)) "enabled" else "disabled"
            "${p.name} — ${p.status} — $enabled\n${p.freeNote}"
        }
        findViewById<Button>(R.id.consoleClearButton).setOnClickListener {
            store.clearHistory()
            log.text = "History cleared."
        }
        findViewById<Button>(R.id.consoleCloseButton).setOnClickListener { finish() }
    }
}
