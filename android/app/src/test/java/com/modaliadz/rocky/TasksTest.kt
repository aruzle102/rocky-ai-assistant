package com.modaliadz.rocky

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

class TasksTest {
    @Test
    fun planExecuteVerifyFile() {
        val files = InMemoryFileStore()
        val steps = TaskEngine.planFor("create file: hello.txt with: Hello ROCKY")
        assertEquals(1, steps.size)
        val report = TaskEngine.execute(steps, files, InMemoryNoteStore(), FakeResearch(null))
        assertEquals(StepStatus.DONE, steps[0].status)
        assertEquals("Hello ROCKY", files.read("hello.txt"))
        assertTrue(report.contains("1 done"))
        assertTrue(steps[0].detail.contains("Verified"))
    }

    @Test
    fun researchStepVerified() {
        val steps = TaskEngine.planFor("research: Algiers")
        val report = TaskEngine.execute(
            steps, InMemoryFileStore(), InMemoryNoteStore(),
            FakeResearch(ResearchResult("Algiers is the capital of Algeria.", "DuckDuckGo"))
        )
        assertEquals(StepStatus.DONE, steps[0].status)
        assertTrue(report.contains("Algiers is the capital"))
    }

    @Test
    fun unsupportedActionNeverMarkedDone() {
        val steps = TaskEngine.planFor("call mom")
        TaskEngine.execute(steps, InMemoryFileStore(), InMemoryNoteStore(), FakeResearch(null))
        assertEquals(StepStatus.UNSUPPORTED, steps[0].status)
    }

    @Test
    fun deleteNeedsConfirmationThenDeletes() {
        val tmp = Files.createTempDirectory("rocky-test").toFile()
        val tools = ToolRegistry(File(tmp, "projects"), InMemoryFileStore(), InMemoryNoteStore(), FakeResearch(null))
        tools.writeProjectFile("p", "a.txt", "hello")
        val without = tools.execute("delete_file", mapOf("slug" to "p", "filename" to "a.txt"))
        assertEquals(ToolStatus.NEEDS_CONFIRMATION, without.status)
        assertTrue(File(File(tmp, "projects/p"), "a.txt").exists())
        val with = tools.execute("delete_file", mapOf("slug" to "p", "filename" to "a.txt", "confirmed" to "true"))
        assertEquals(ToolStatus.DONE, with.status)
        assertFalse(File(File(tmp, "projects/p"), "a.txt").exists())
    }

    @Test
    fun exportZipEntriesVerified() {
        val tmp = Files.createTempDirectory("rocky-zip").toFile()
        val tools = ToolRegistry(File(tmp, "projects"), InMemoryFileStore(), InMemoryNoteStore(), FakeResearch(null))
        for ((name, content) in RestaurantScaffold.files()) tools.writeProjectFile("restaurant", name, content)
        val r = tools.exportProjectZip("restaurant")
        assertTrue(r != null)
        val zip = java.util.zip.ZipFile(r!!.first)
        val names = zip.entries().toList().map { it.name }.sorted()
        assertEquals(listOf("index.html", "script.js", "styles.css"), names)
        zip.close()
    }
}
