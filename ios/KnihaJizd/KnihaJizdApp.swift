import SwiftUI

@main struct KnihaJizdApp: App {
    @StateObject private var recorder = Recorder.shared
    var body: some Scene {
        WindowGroup {
            LogWebView(recorder: recorder)
                .background(Color(red: 23/255, green: 25/255, blue: 29/255))
                .preferredColorScheme(.dark)
        }
    }
}
