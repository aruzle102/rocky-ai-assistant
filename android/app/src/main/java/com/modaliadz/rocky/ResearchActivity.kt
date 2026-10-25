package com.modaliadz.rocky

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/** Research results + source inspection for the last deep-research run. */
class ResearchActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_research)
        val store = MemoryStore(this)
        val queryView = findViewById<TextView>(R.id.researchQuery)
        val summaryView = findViewById<TextView>(R.id.researchSummary)
        val sourcesView = findViewById<TextView>(R.id.researchSources)
        if (store.lastResearchQuery.isBlank()) {
            queryView.text = "No research yet"
            summaryView.text = "Ask ROCKY for \"deep research: <topic>\" and the result will appear here with its sources."
            sourcesView.text = ""
        } else {
            queryView.text = store.lastResearchQuery
            summaryView.text = store.lastResearchSummary
            sourcesView.text = store.lastResearchSources
        }
        findViewById<Button>(R.id.researchOpenButton).setOnClickListener {
            val first = store.lastResearchSources.split(",").firstOrNull()?.trim() ?: ""
            if (first.startsWith("http")) {
                try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(first))) } catch (_: Exception) { }
            }
        }
        findViewById<Button>(R.id.researchCloseButton).setOnClickListener { finish() }
    }
}
