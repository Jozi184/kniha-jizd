import SwiftUI

@main struct KnihaJizdApp: App {
    @StateObject private var recorder = Recorder()
    var body: some Scene { WindowGroup { ContentView().environmentObject(recorder) } }
}

struct ContentView: View {
    @EnvironmentObject var recorder: Recorder
    @State private var history = false
    @State private var confirmDiscard = false
    private let lime = Color(red: 0.824, green: 0.973, blue: 0.357)
    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Image(systemName: "car.fill").font(.system(size: 48)).foregroundColor(lime)
                Text("Kniha jízd").font(.largeTitle.bold())
                Text(String(format: "%.3f km", recorder.ride?.distanceKm ?? 0).replacingOccurrences(of: ".", with: ","))
                    .font(.system(size: 48, weight: .bold, design: .rounded)).monospacedDigit()
                Text(recorder.message).multilineTextAlignment(.center).foregroundColor(.secondary)
                if let ride = recorder.ride {
                    if ride.endedAt == nil {
                        Button("Ukončit jízdu") { recorder.stop() }.buttonStyle(.borderedProminent).tint(lime).foregroundColor(.black)
                    } else {
                        Button("Zkontrolovat a uložit jízdu") { history = true }.buttonStyle(.borderedProminent).tint(lime).foregroundColor(.black)
                        Button("Zahodit jízdu", role: .destructive) { confirmDiscard = true }
                    }
                } else {
                    Button("Zahájit GPS jízdu") { recorder.start() }.buttonStyle(.borderedProminent).tint(lime).foregroundColor(.black)
                }
                Button("Historie, tachometr a export") { history = true }
                Text("GPS jízdu spouštěj zde. Webová historie slouží k uložení a exportu.")
                    .font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
                Spacer()
            }.padding(28).padding(.top, 30)
                .frame(maxWidth: .infinity).background(Color(red: 0.09, green: 0.10, blue: 0.11))
                .navigationDestination(isPresented: $history) { LogWebView(recorder: recorder).navigationTitle("Historie a uložení").navigationBarTitleDisplayMode(.inline) }
                .confirmationDialog("Opravdu zahodit tuto jízdu?", isPresented: $confirmDiscard, titleVisibility: .visible) {
                    Button("Zahodit", role: .destructive) { recorder.discard() }
                }
        }.preferredColorScheme(.dark)
    }
}
