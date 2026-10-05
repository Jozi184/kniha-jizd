import ActivityKit
import Foundation

struct RideActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var distanceKm: Double
        var message: String
        var ended: Bool
        var pausedAt: Date? = nil
        var pausedMilliseconds: Double? = nil
    }
    var rideId: String
    var startedAt: Date
}
