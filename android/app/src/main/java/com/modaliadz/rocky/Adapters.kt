package com.modaliadz.rocky

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

class ChatAdapter(private val items: MutableList<ChatMessage>) :
    RecyclerView.Adapter<ChatAdapter.Holder>() {
    class Holder(v: View) : RecyclerView.ViewHolder(v) {
        val meta: TextView = v.findViewById(R.id.metaText)
        val body: TextView = v.findViewById(R.id.bodyText)
    }
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_message, parent, false)
        return Holder(v)
    }
    override fun onBindViewHolder(h: Holder, pos: Int) {
        val m = items[pos]
        h.meta.text = if (m.role == "user") "YOU" else "ROCKY" + if (m.provider.isNotBlank()) " · ${m.provider}" else ""
        h.body.text = m.text
    }
    override fun getItemCount() = items.size
    fun add(m: ChatMessage) {
        items.add(m)
        notifyItemInserted(items.size - 1)
    }
}

class TaskAdapter(private val items: MutableList<TaskStep>) :
    RecyclerView.Adapter<TaskAdapter.Holder>() {
    class Holder(v: View) : RecyclerView.ViewHolder(v) {
        val title: TextView = v.findViewById(R.id.taskTitle)
        val detail: TextView = v.findViewById(R.id.taskDetail)
    }
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_task, parent, false)
        return Holder(v)
    }
    override fun onBindViewHolder(h: Holder, pos: Int) {
        val s = items[pos]
        h.title.text = "${s.title} — ${s.status}"
        h.detail.text = s.detail
    }
    override fun getItemCount() = items.size
    fun setAll(steps: List<TaskStep>) {
        items.clear(); items.addAll(steps); notifyDataSetChanged()
    }
}

class ProviderAdapter(
    private val items: List<Provider>,
    private val health: Map<String, ProviderHealth>,
    private val onTest: (Provider) -> Unit,
    private val onToggle: (Provider) -> Unit
) : RecyclerView.Adapter<ProviderAdapter.Holder>() {
    class Holder(v: View) : RecyclerView.ViewHolder(v) {
        val name: TextView = v.findViewById(R.id.providerName)
        val status: TextView = v.findViewById(R.id.providerStatus)
        val test: Button = v.findViewById(R.id.testProviderButton)
        val toggle: Button = v.findViewById(R.id.toggleProviderButton)
    }
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_provider, parent, false)
        return Holder(v)
    }
    override fun onBindViewHolder(h: Holder, pos: Int) {
        val p = items[pos]
        val hl = health[p.id]
        h.name.text = p.name
        h.status.text = "${p.status} · ${if (hl?.autoDisabled == true) "AUTO-DISABLED after failures" else if (hl?.enabled == false) "DISABLED" else "enabled"} · " +
            "ok=${hl?.successes ?: 0} fail=${hl?.failures ?: 0} · last: ${hl?.lastError ?: (hl?.lastLatencyMs?.let { "$it ms" } ?: "never tested")}"
        h.test.setOnClickListener { onTest(p) }
        h.toggle.setOnClickListener { onToggle(p) }
    }
    override fun getItemCount() = items.size
}
