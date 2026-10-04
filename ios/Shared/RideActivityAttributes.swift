import ActivityKit
import Foundation

struct RideActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var distanceKm: Double
        var message: String
        var ended: Bool
    }
    var rideId: String
    var startedAt: Date
}
