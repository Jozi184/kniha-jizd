import Foundation
import CoreLocation

func point(_ metres: Double, _ seconds: Double) -> CLLocation {
    CLLocation(coordinate: CLLocationCoordinate2D(latitude: metres / 111_195, longitude: 0), altitude: 0, horizontalAccuracy: 5, verticalAccuracy: 5, timestamp: Date(timeIntervalSince1970: seconds))
}
func check(_ condition: @autoclosure () -> Bool, _ description: String) {
    if !condition() { fatalError(description) }
}
func total(_ points: [CLLocation]) -> Double {
    var accumulator = DistanceAccumulator()
    return points.reduce(0) { result, point in result + (accumulator.consume(point)?.metres ?? 0) }
}

let slow = (0...100).map { point(Double($0) * 2, Double($0)) }
let expectedSlow = slow.last!.distance(from: slow.first!)
let measuredSlow = total(slow)
check(measuredSlow > expectedSlow - 3.01 && measuredSlow <= expectedSlow + 0.01, "Sub-3m movement must accumulate; only a final tail under 3m may be omitted")
let verySlow = (0...180).map { point(Double($0) * 0.5, Double($0)) }
check(total(verySlow) > verySlow.last!.distance(from: verySlow.first!) - 3.01, "Regular samples must not become a gap merely because the distance anchor is old")
let ordinary = (0...60).map { point(Double($0) * 10, Double($0)) }
check(abs(total(ordinary) - ordinary.last!.distance(from: ordinary.first!)) < 0.01, "Normal driving distance must remain unchanged")
check(total((0...120).map { point(Double(($0 % 3) - 1), Double($0)) }) == 0, "Stationary jitter within the threshold must not accumulate as travel")

var filter = DistanceAccumulator()
check(filter.consume(point(0, 0))?.startsSegment == true, "First point starts a segment")
check(filter.consume(point(10, 1))!.metres > 9, "Normal sample counts")
let resumed = filter.consume(point(1000, 32))!
check(resumed.metres == 0 && resumed.startsSegment, "A gap over 30s must not invent missing distance")
check(filter.consume(point(1010, 33))!.metres > 9, "Tracking resumes after a gap")
check(filter.consume(point(1500, 33)) == nil, "Duplicate timestamps must be ignored")
check(filter.consume(point(1500, 30)) == nil, "Out-of-order timestamps must be ignored")
check(filter.consume(point(1020, 34))!.metres > 9, "Rejected timestamps must not move the anchor")
filter.reset()
check(filter.consume(point(1100, 35))!.metres == 0, "Reset on poor GPS must not bridge the rejected interval")
check(filter.consume(point(1400, 36)) == nil, "Impossible speed spikes must be rejected")
let afterSpike = filter.consume(point(1110, 37))!
check(afterSpike.metres == 0 && afterSpike.startsSegment, "A rejected spike must not create a counted return jump")
check(filter.consume(point(1120, 38))!.metres > 9, "Normal driving resumes after the spike")
let now = Date(timeIntervalSince1970: 300)
check(DistanceAccumulator.belongsToRide(point(0, 110).timestamp, startedAtMs: 100_000, now: now), "Delayed GPS fixes from this ride must be retained")
check(!DistanceAccumulator.belongsToRide(point(0, 99).timestamp, startedAtMs: 100_000, now: now), "Cached fixes before the ride must be rejected")
check(!DistanceAccumulator.belongsToRide(point(0, 306).timestamp, startedAtMs: 100_000, now: now), "Future timestamps must be rejected")
let delayedBatch = (0...100).map { point(Double($0) * 2, 110 + Double($0)) }.filter { DistanceAccumulator.belongsToRide($0.timestamp, startedAtMs: 100_000, now: now) }
check(total(delayedBatch) > expectedSlow - 3.01, "A delayed batch must retain its measured distance without extrapolation")
print("Passed: delayed batches and ride timestamp bounds,  slow movement, old anchors with fresh samples, normal driving, stationary jitter, gaps, resets, timestamps and GPS spikes")
