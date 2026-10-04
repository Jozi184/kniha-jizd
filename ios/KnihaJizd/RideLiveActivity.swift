import ActivityKit
import Foundation

@MainActor final class RideLiveActivity {
    private var activity: Activity<RideActivityAttributes>?
    private var lastUpdate = Date.distantPast
    var enabled: Bool {
        if #available(iOS 16.2, *) { return ActivityAuthorizationInfo().areActivitiesEnabled }
        return false
    }
    func start(_ ride: Ride, required: Bool) throws {
        guard #available(iOS 16.2, *), enabled else {
            if required { throw RideActionError.unavailable("Povol Živé aktivity v Nastavení → Kniha jízd.") }
            return
        }
        let attributes = RideActivityAttributes(rideId: ride.id, startedAt: Date(timeIntervalSince1970: ride.startedAt / 1000))
        let state = RideActivityAttributes.ContentState(distanceKm: ride.distanceKm, message: "Hledám GPS polohu…", ended: false)
        do {
            activity = try Activity.request(attributes: attributes, content: ActivityContent(state: state, staleDate: Date().addingTimeInterval(60)), pushType: nil)
            lastUpdate = .distantPast
        } catch {
            if required { throw RideActionError.unavailable("Živou aktivitu se nepodařilo spustit. Otevři aplikaci a zkus to znovu.") }
        }
    }
    func update(_ ride: Ride, message: String) {
        guard #available(iOS 16.2, *), let activity, Date().timeIntervalSince(lastUpdate) >= 5 else { return }
        lastUpdate = Date()
        let content = ActivityContent(state: RideActivityAttributes.ContentState(distanceKm: ride.distanceKm, message: message, ended: false), staleDate: Date().addingTimeInterval(60))
        Task { await activity.update(content) }
    }
    func finish(_ ride: Ride) {
        guard #available(iOS 16.2, *), let activity else { return }
        self.activity = nil
        let content = ActivityContent(state: RideActivityAttributes.ContentState(distanceKm: ride.distanceKm, message: "Čeká na kontrolu v aplikaci", ended: true), staleDate: nil)
        Task { await activity.end(content, dismissalPolicy: .after(Date().addingTimeInterval(30))) }
    }
    func finishOrphans() {
        guard #available(iOS 16.2, *) else { return }
        let orphans = Activity<RideActivityAttributes>.activities
        Task {
            for activity in orphans {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }
}
