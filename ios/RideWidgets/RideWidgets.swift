import SwiftUI
import WidgetKit
import ActivityKit
import AppIntents

private let lime = Color(red: 0.82, green: 0.97, blue: 0.28)

@main
struct RideWidgetBundle: WidgetBundle {
    var body: some Widget {
        RideLiveWidget()
        RideStartWidget()
        StartRideControl()
        StopRideControl()
    }
}

struct RideLiveWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RideActivityAttributes.self) { context in
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Label("Kniha jízd", systemImage: "car.fill").foregroundStyle(lime)
                    Spacer()
                    Text(context.state.ended ? "Ukončeno" : "Jízda probíhá").font(.caption)
                }
                HStack(alignment: .firstTextBaseline) {
                    Text(context.state.distanceKm, format: .number.precision(.fractionLength(3)))
                        .font(.largeTitle.bold()).monospacedDigit()
                    Text("km")
                    Spacer()
                    if !context.state.ended {
                        Text(timerInterval: context.attributes.startedAt...Date.distantFuture, countsDown: false)
                            .monospacedDigit().frame(width: 85)
                    }
                }
                if context.isStale && !context.state.ended {
                    Text("Čekám na aktualizaci GPS…").font(.caption)
                } else { Text(context.state.message).font(.caption).lineLimit(2) }
                if !context.state.ended {
                    Button(intent: StopRideIntent()) { Label("Ukončit jízdu", systemImage: "stop.fill") }
                        .buttonStyle(.borderedProminent).tint(lime).foregroundStyle(.black)
                }
            }
            .padding(16)
            .activityBackgroundTint(Color(red: 0.09, green: 0.10, blue: 0.11))
            .activitySystemActionForegroundColor(.white)
            .foregroundStyle(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Image(systemName: "car.fill").foregroundStyle(lime) }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.distanceKm, format: .number.precision(.fractionLength(3))).monospacedDigit()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if context.state.ended { Text("Čeká na kontrolu") }
                    else {
                        Button(intent: StopRideIntent()) { Label("Ukončit jízdu", systemImage: "stop.fill") }.tint(lime)
                    }
                }
            } compactLeading: { Image(systemName: "car.fill").foregroundStyle(lime) }
            compactTrailing: { Text(context.state.distanceKm, format: .number.precision(.fractionLength(1))).monospacedDigit() }
            minimal: { Image(systemName: "car.fill").foregroundStyle(lime) }
        }
    }
}

private struct StartEntry: TimelineEntry { let date: Date }
private struct StartProvider: TimelineProvider {
    func placeholder(in context: Context) -> StartEntry { StartEntry(date: .now) }
    func getSnapshot(in context: Context, completion: @escaping (StartEntry) -> Void) { completion(StartEntry(date: .now)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<StartEntry>) -> Void) {
        completion(Timeline(entries: [StartEntry(date: .now)], policy: .never))
    }
}
private struct StartWidgetView: View {
    @Environment(\.widgetFamily) private var family
    var body: some View {
        Button(intent: StartRideIntent()) {
            if family == .accessoryCircular {
                Image(systemName: "car.fill").font(.title2).accessibilityLabel("Zahájit GPS jízdu")
            } else { Label("Zahájit jízdu", systemImage: "car.fill").font(.headline) }
        }.buttonStyle(.plain)
    }
}

struct RideStartWidget: Widget {
    let kind = "RideStartWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: StartProvider()) { _ in
            StartWidgetView().containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Zahájit GPS jízdu")
        .description("Spustí GPS jízdu bez otevření rozhraní aplikace.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular])
    }
}
struct StartRideControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "cz.jozi.knihajizd.start") {
            ControlWidgetButton(action: StartRideIntent()) { Label("Zahájit jízdu", systemImage: "car.fill") }
        }
        .displayName("Zahájit jízdu").description("Spustí GPS měření v Knize jízd.")
    }
}
struct StopRideControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "cz.jozi.knihajizd.stop") {
            ControlWidgetButton(action: StopRideIntent()) { Label("Ukončit jízdu", systemImage: "stop.fill") }
        }
        .displayName("Ukončit jízdu").description("Uloží záznam do telefonu ke kontrole.")
    }
}
