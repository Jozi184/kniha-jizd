import CoreLocation

// The 3 m noise threshold applies to displacement from the last counted point,
// not to each incoming sample. This retains slow movement without adding every
// small jitter. Separate sample timing detects gaps even when the anchor is old.
struct DistanceAccumulator {
    struct Sample {
        var metres: Double
        var appendPoint: Bool
        var startsSegment: Bool
    }
    static func belongsToRide(_ timestamp: Date, startedAtMs: Double, now: Date = Date()) -> Bool {
        let milliseconds = timestamp.timeIntervalSince1970 * 1000
        return milliseconds.isFinite && milliseconds >= startedAtMs && timestamp <= now.addingTimeInterval(5)
    }
    private var previous: CLLocation?
    private var anchor: CLLocation?

    mutating func reset() { previous = nil; anchor = nil }

    mutating func consume(_ point: CLLocation) -> Sample? {
        if let previous {
            let seconds = point.timestamp.timeIntervalSince(previous.timestamp)
            guard seconds > 0 else { return nil }
            if seconds > 30 { reset() }
            else if point.distance(from: previous) / seconds * 3.6 >= 220 {
                // Reject the spike and start a new segment at the next usable fix.
                reset(); return nil
            }
        }
        previous = point
        guard let anchor else {
            self.anchor = point
            return Sample(metres: 0, appendPoint: true, startsSegment: true)
        }
        let metres = point.distance(from: anchor)
        guard metres >= 3 else {
            return Sample(metres: 0, appendPoint: false, startsSegment: false)
        }
        self.anchor = point
        return Sample(metres: metres, appendPoint: true, startsSegment: false)
    }
}
