package com.modaliadz.rocky

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

class ProjectsActivity : AppCompatActivity() {
    private lateinit var store: MemoryStore
    private lateinit var tools: ToolRegistry
    private lateinit var projectList: RecyclerView
    private lateinit var fileList: RecyclerView
    private lateinit var fileViewer: EditText
    private lateinit var detailTitle: TextView
    private lateinit var agentLog: TextView
    private var selectedProject: String? = null
    private var selectedFile: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_projects)
        store = MemoryStore(this)
        val projectsRoot = File(filesDir, "projects")
        tools = ToolRegistry(projectsRoot, store, store, RealResearchClient())
        detailTitle = findViewById(R.id.detailTitle)
        fileViewer = findViewById(R.id.fileViewer)
        agentLog = findViewById(R.id.agentLog)

        projectList = findViewById(R.id.projectList)
        projectList.layoutManager = LinearLayoutManager(this)
        fileList = findViewById(R.id.fileList)
        fileList.layoutManager = LinearLayoutManager(this)
        refreshProjects()

        findViewById<Button>(R.id.buildDemoButton).setOnClickListener { buildRestaurantDemo() }
        findViewById<Button>(R.id.saveFileButton).setOnClickListener {
            val slug = selectedProject; val file = selectedFile
            if (slug == null || file == null) {
                Toast.makeText(this, "Select a project and a file first", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            if (tools.writeProjectFile(slug, file, fileViewer.text.toString(), "edit_file")) {
                Toast.makeText(this, "Saved $file", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, "Could not save $file", Toast.LENGTH_SHORT).show()
            }
        }
        findViewById<Button>(R.id.previewButton).setOnClickListener {
            val slug = selectedProject
            if (slug == null) {
                Toast.makeText(this, "Select a project first", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            startActivity(Intent(this, PreviewActivity::class.java).putExtra("slug", slug))
        }
        findViewById<Button>(R.id.exportButton).setOnClickListener {
            val slug = selectedProject
            if (slug == null) {
                Toast.makeText(this, "Select a project first", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val r = tools.exportProjectZip(slug)
            if (r != null) {
                val file = File(r.first)
                val uri: Uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
                val share = Intent(Intent.ACTION_SEND).apply {
                    type = "application/zip"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                Toast.makeText(this, "Exported ${r.second} files", Toast.LENGTH_SHORT).show()
                startActivity(Intent.createChooser(share, "Share project ZIP"))
            } else {
                Toast.makeText(this, "Export failed", Toast.LENGTH_SHORT).show()
            }
        }
        findViewById<Button>(R.id.closeProjectsButton).setOnClickListener { finish() }
    }

    private fun refreshProjects() {
        val projects = tools.listProjects()
        projectList.adapter = SimpleAdapter(projects) { slug ->
            selectedProject = slug
            detailTitle.text = "Project: $slug"
            val files = tools.listProjectFiles(slug)
            fileList.adapter = SimpleAdapter(files) { file ->
                selectedFile = file
                fileViewer.setText(tools.readProjectFile(slug, file) ?: "")
            }
        }
        if (projects.isEmpty()) {
            detailTitle.text = "No projects yet — tap 'Build restaurant demo' or ask ROCKY to build a website."
        }
    }

    private fun buildRestaurantDemo() {
        // Agent console log (JARVIS console pattern, original UI): every
        // step is appended — step, tool, status, output — never overwritten.
        val logLines = mutableListOf<String>()
        agentLog.text = "Agent running (scaffold tool — not model output)…"
        Thread {
            val runtime = AgentRuntime(tools) { step ->
                runOnUiThread {
                    logLines.add("Step: ${step.tool} — ${step.status} — ${step.output}")
                    agentLog.text = logLines.takeLast(20).joinToString("\n")
                }
            }
            val result = runtime.run(
                "Build a professional restaurant website with a menu, gallery, responsive design, and reservation form",
                null, AtomicBoolean(false)
            )
            runOnUiThread {
                logLines.add("Result: ${result.message}")
                agentLog.text = logLines.takeLast(20).joinToString("\n")
                refreshProjects()
                // Website = files + validation + preview: on success the
                // preview screen opens next; on failure the task stays
                // reported INCOMPLETE in the log above.
                if (result.success && result.projectSlug != null) {
                    startActivity(Intent(this, PreviewActivity::class.java).putExtra("slug", result.projectSlug))
                }
            }
        }.start()
    }

    private class SimpleAdapter(
        private val items: List<String>,
        private val onClick: (String) -> Unit
    ) : RecyclerView.Adapter<SimpleAdapter.Holder>() {
        class Holder(v: View) : RecyclerView.ViewHolder(v) {
            val title: TextView = v.findViewById(R.id.taskTitle)
            val detail: TextView = v.findViewById(R.id.taskDetail)
        }
        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
            val v = LayoutInflater.from(parent.context).inflate(R.layout.item_task, parent, false)
            return Holder(v)
        }
        override fun onBindViewHolder(h: Holder, pos: Int) {
            h.title.text = items[pos]
            h.detail.text = ""
            h.itemView.setOnClickListener { onClick(items[pos]) }
        }
        override fun getItemCount() = items.size
    }
}
