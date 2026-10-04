import AppIntents

// LiveActivityIntent is implemented in both bundles so WidgetKit can resolve the
// button. iOS executes this special intent in the containing app process, where
// Recorder.shared owns GPS and the durable queue. Never record in the extension.
@available(iOS 17.0, *)
struct StartRideIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Zahájit GPS jízdu"
    static var description = IntentDescription("Spustí měření jízdy a její zobrazení na zamčené obrazovce.")
    static var openAppWhenRun = false
    static var authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed
    @available(iOS 26.0, *)
    static var supportedModes: IntentModes { .background }

    @MainActor func perform() async throws -> some IntentResult & ProvidesDialog {
        let started = try RideIntentExecutor.start()
        if !started { return .result(dialog: "Jízda už probíhá.") }
        return .result(dialog: "GPS jízda je spuštěná.")
    }
}

@available(iOS 17.0, *)
struct StopRideIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Ukončit GPS jízdu"
    static var description = IntentDescription("Ukončí měření a uloží jízdu do telefonu ke kontrole.")
    static var openAppWhenRun = false
    static var authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed
    @available(iOS 26.0, *)
    static var supportedModes: IntentModes { .background }

    @MainActor func perform() async throws -> some IntentResult & ProvidesDialog {
        try RideIntentExecutor.stop()
        return .result(dialog: "Měření je ukončené. Jízdy zkontroluješ v aplikaci.")
    }
}

private enum RideIntentExecutor {
    @MainActor static func start() throws -> Bool {
        #if WIDGET_EXTENSION
        throw IntentError.appRequired
        #else
        return try Recorder.shared.startFromSystem()
        #endif
    }
    @MainActor static func stop() throws {
        #if WIDGET_EXTENSION
        throw IntentError.appRequired
        #else
        guard Recorder.shared.stop() else { throw IntentError.saveFailed }
        #endif
    }
}

private enum IntentError: Error, CustomLocalizedStringResourceConvertible {
    case appRequired, saveFailed
    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .appRequired: return "Akci se nepodařilo předat aplikaci. Otevři Knihu jízd a zkus to znovu."
        case .saveFailed: return "Jízdu se nepodařilo uložit. Otevři aplikaci a zkus ukončení znovu."
        }
    }
}

#if !WIDGET_EXTENSION
@available(iOS 17.0, *)
// Siri training uses an English base locale; the visible action titles stay Czech.
struct RideShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: StartRideIntent(), phrases: ["Start a ride in \(.applicationName)"], shortTitle: "Zahájit jízdu", systemImageName: "car.fill")
        AppShortcut(intent: StopRideIntent(), phrases: ["Stop a ride in \(.applicationName)"], shortTitle: "Ukončit jízdu", systemImageName: "stop.fill")
    }
}
#endif
