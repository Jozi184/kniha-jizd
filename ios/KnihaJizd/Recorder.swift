import Foundation
import CoreLocation
import Combine

struct Ride: Codable, Identifiable {
    var id = UUID().uuidString
    var startedAt = Date().timeIntervalSince1970 * 1000
    var endedAt: Double?
    var distanceKm = 0.0
    var route: [[Double]] = []
    var odometerStart: Double?
    var userId: String?
}

@MainActor final class Recorder: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var ride: Ride?
    @Published var speedKmh = 0.0
    @Published var message = "Připraveno k jízdě"
    private let manager = CLLocationManager()
    private var last: CLLocation?
    private var gap = true
    private var pendingStart = false
    private var pendingOdometer = 0.0
    private var pendingUserId: String?
    private var pendingProbe = false
    private let file: URL
    override init() {
        let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        file = directory.appendingPathComponent("active-ride.json")
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        manager.distanceFilter = kCLDistanceFilterNone
        manager.activityType = .automotiveNavigation
        manager.pausesLocationUpdatesAutomatically = false
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = true
        if let data = try? Data(contentsOf: file) {
            do {
                var restored = try JSONDecoder().decode(Ride.self, from: data)
                if restored.endedAt == nil { restored.endedAt = Date().timeIntervalSince1970 * 1000 }
                ride = restored
                message = "Obnovená jízda. Zkontroluj kilometry před uložením."
                persist()
            } catch { message = "Záznam se nepodařilo přečíst. Původní soubor zůstává v zařízení." }
        }
    }
    func start(odometer: Double = 0, userId: String? = nil) {
        guard ride == nil else { return }
        guard CLLocationManager.locationServicesEnabled() else { message = "Zapni polohové služby v Nastavení."; return }
        switch manager.authorizationStatus {
        case .notDetermined: pendingStart = true; pendingOdometer = odometer; pendingUserId = userId; manager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            ride = Ride(); ride?.odometerStart = odometer; ride?.userId = userId; speedKmh = 0; last = nil; gap = true; persist()
            message = "Hledám přesnou GPS polohu…"; manager.startUpdatingLocation()
        default: message = "Povol polohu aplikaci v Nastavení → Soukromí → Polohové služby."
        }
    }
    func testGps() {
        guard ride == nil else { message = "GPS už zaznamenává jízdu."; return }
        pendingProbe = true
        if manager.authorizationStatus == .notDetermined {
            message = "Žádám o přístup k GPS…"; manager.requestWhenInUseAuthorization()
        } else if manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorizedWhenInUse {
            message = "Hledám GPS polohu…"; manager.requestLocation()
        } else {
            pendingProbe = false; message = "Povol polohu aplikaci v Nastavení → Soukromí → Polohové služby."
        }
    }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted {
            pendingStart = false; pendingProbe = false; message = "Povol polohu aplikaci v Nastavení → Soukromí → Polohové služby."
        }
        if pendingProbe && [.authorizedAlways, .authorizedWhenInUse].contains(manager.authorizationStatus) {
            manager.requestLocation()
        }
        if pendingStart && [.authorizedAlways, .authorizedWhenInUse].contains(manager.authorizationStatus) {
            pendingStart = false; start(odometer: pendingOdometer, userId: pendingUserId)
        }
    }
    func retry() {
        guard ride != nil, ride?.endedAt == nil else { return }
        manager.stopUpdatingLocation(); last = nil; gap = true
        manager.startUpdatingLocation(); message = "Hledám přesnou GPS polohu…"
    }
    func stop() {
        guard ride?.endedAt == nil, ride != nil else { return }
        manager.stopUpdatingLocation(); ride?.endedAt = Date().timeIntervalSince1970 * 1000
        last = nil; persist(); message = "Jízda čeká na uložení nebo zahození."
    }
    func discard() { manager.stopUpdatingLocation(); ride = nil; last = nil; try? FileManager.default.removeItem(at: file); message = "Připraveno k jízdě" }
    func acknowledge(_ id: String) { if ride?.id == id && ride?.endedAt != nil { discard() } }
    private func persist() {
        guard let ride else { return }
        do { try JSONEncoder().encode(ride).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]) }
        catch { message = "Zápis do zařízení selhal: \(error.localizedDescription)" }
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        if pendingProbe && ride == nil {
            pendingProbe = false
            if let point = locations.last, point.horizontalAccuracy >= 0 {
                message = "GPS funguje. Přesnost přibližně ±\(Int(point.horizontalAccuracy)) m."
            } else { message = "GPS zatím nezískala použitelnou polohu." }
            return
        }
        guard ride != nil, ride?.endedAt == nil else { return }
        for point in locations.sorted(by: { $0.timestamp < $1.timestamp }) {
            guard point.horizontalAccuracy >= 0, point.horizontalAccuracy <= 60,
                  abs(point.timestamp.timeIntervalSinceNow) < 30 else { gap = true; continue }
            var count = false
            if let previous = last {
                let dt = point.timestamp.timeIntervalSince(previous.timestamp)
                guard dt > 0 else { continue }
                let metres = point.distance(from: previous)
                if dt > 30 { gap = true }
                else if metres >= 3 && metres / dt * 3.6 < 220 { ride?.distanceKm += metres / 1000; count = true }
            }
            if last == nil || count || gap {
                ride?.route.append([point.coordinate.latitude, point.coordinate.longitude, gap ? 1 : 0])
                if let route = ride?.route, route.count > 1024 {
                    // Preserve discontinuities when compacting the route.
                    var reduced: [[Double]] = [route[0]]
                    var index = 2
                    while index < route.count {
                        var point = route[index]
                        if route[index - 1][2] == 1 { point[2] = 1 }
                        reduced.append(point); index += 2
                    }
                    if route.count % 2 == 0 { reduced.append(route.last!) }
                    ride?.route = reduced
                }
                gap = false
            }
            speedKmh = max(0, point.speed * 3.6)
            last = point
            message = manager.accuracyAuthorization == .reducedAccuracy ? "Zapni Přesnou polohu pro lepší měření." : "GPS zaznamenává jízdu"
            persist()
        }
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        pendingProbe = false; gap = true; last = nil; message = "GPS: \(error.localizedDescription)"
    }
}
