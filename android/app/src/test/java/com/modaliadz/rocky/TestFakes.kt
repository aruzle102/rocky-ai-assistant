package com.modaliadz.rocky

class FakeHttp : HttpClient {
    var getHandler: ((String) -> HttpResponse)? = null
    var postHandler: ((String, String) -> HttpResponse)? = null
    var getResponse: HttpResponse = HttpResponse(200, "")
    var postResponse: HttpResponse = HttpResponse(200, "")
    var getCount = 0
    var postCount = 0
    override fun get(url: String, headers: Map<String, String>): HttpResponse {
        getCount++
        return getHandler?.invoke(url) ?: getResponse
    }
    override fun post(url: String, headers: Map<String, String>, body: String): HttpResponse {
        postCount++
        return postHandler?.invoke(url, body) ?: postResponse
    }
}

class InMemoryFileStore : FileStore {
    val files = mutableMapOf<String, String>()
    override fun write(name: String, content: String): Boolean { files[name] = content; return true }
    override fun read(name: String): String? = files[name]
}

class InMemoryNoteStore : NoteStore {
    val notes = mutableListOf<String>()
    val reminders = mutableListOf<String>()
    override fun addNote(text: String): Boolean { notes.add(text); return true }
    override fun addReminder(text: String, whenText: String): Boolean { reminders.add(text); return true }
}

class FakeResearch(private val result: ResearchResult?) : ResearchClient {
    override fun search(query: String): ResearchResult? = result
}

class FakeModel(private val reply: String) : ModelClient {
    override fun generate(prompt: String): String = reply
}
