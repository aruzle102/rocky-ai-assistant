package com.modaliadz.rocky

/** Pure back-button decision logic, unit-tested. The Activity mirrors its UI
 *  state into this class so back never exits while a panel is open. */
enum class BackAction { SKIP_INTRO, CLOSE_PANEL, EXIT }

class BackNavigator {
    var introShowing: Boolean = false
    var panelOpen: Boolean = false

    fun onBack(): BackAction = when {
        introShowing -> BackAction.SKIP_INTRO
        panelOpen -> BackAction.CLOSE_PANEL
        else -> BackAction.EXIT
    }
}
