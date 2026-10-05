import Foundation
import CoreLocation
import Combine

struct Ride: Codable, Identifiable {
    var id = UUID().uuidString
    var startedAt = Date().timeIntervalSince1970 * 1000
    var endedAt: Double?
    var pause: RidePauseClock?
    var distanceKm = 0.0
    var route: [[Double]] = []
    var odometerStart: Double?
    var userId: String?
}

struct RideAccountContext: Codable {
    var userId: String
    var odometer: Double
}

struct RideArchive: Codable {
    var active: Ride?
    var pending: [Ride] = []
    var account: RideAccountContext?
}

enum RideActionError: LocalizedError {
    case unavailable(String)
    var errorDescription: String? { switch self { case .unavailable(let message): return message } }
}

// CLLocationManager is created on MainActor, so Core Location delivers delegate
// callbacks on the main run loop. @preconcurrency enforces that isolation at runtime
// for the Objective-C delegate protocol, which has no actor annotation.
@MainActor final class Recorder: NSObject, ObservableObject, @preconcurrency CLLocationManagerDelegate {
    static let shared = Recorder()
    @Published private(set) var ride: Ride?
    @Published private(set) var pendingRides: [Ride] = []
    @Published private(set) var backgroundReady = false
    @Published private(set) var account: RideAccountContext?
    @Published var speedKmh: Double?
    @Published var accuracyMetres: Double?
    @Published var lastLocationAtMs: Double?
    @Published var message = "Připraveno k jízdě"
    private let manager = CLLocationManager()
    private var distance = DistanceAccumulator()
    private var pendingStart = false
    private var pendingOdometer = 0.0
    private var pendingUserId: String?
    private var pendingProbe = false
    private let file: URL
    private var storageFailed = false
    private var requestingAlways = false
    private let live = RideLiveActivity()
    override init() {
        let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        file = directory.appendingPathComponent("ride-queue.json")
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        manager.distanceFilter = kCLDistanceFilterNone
        manager.activityType = .automotiveNavigation
        manager.pausesLocationUpdatesAutomatically = false
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = true
        backgroundReady = manager.authorizationStatus == .authorizedAlways
        let legacy = directory.appendingPathComponent("active-ride.json")
        do {
            if FileManager.default.fileExists(atPath: file.path) {
                let archive = try JSONDecoder().decode(RideArchive.self, from: Data(contentsOf: file))
                account = UserDefaults.standard.bool(forKey: "ride-account-disabled") ? nil : archive.account; pendingRides = archive.pending
                // A process termination creates a gap we cannot measure. Preserve the
                // last recorded segment for review instead of silently resuming it.
                if var interrupted = archive.active {
                    if interrupted.pause?.isPaused == true {
                        // No tracking is expected during a pause, so it can safely
                        // remain paused even after iOS terminates the process.
                        ride = interrupted
                    } else {
                        interrupted.endedAt = Date().timeIntervalSince1970 * 1000
                        pendingRides.append(interrupted)
                        try write(RideArchive(active: nil, pending: pendingRides, account: account))
                    }
                }
            } else if FileManager.default.fileExists(atPath: legacy.path) {
                var restored = try JSONDecoder().decode(Ride.self, from: Data(contentsOf: legacy))
                if restored.endedAt == nil { restored.endedAt = Date().timeIntervalSince1970 * 1000 }
                try write(RideArchive(active: nil, pending: [restored], account: nil))
                pendingRides = [restored]
                try? FileManager.default.removeItem(at: legacy)
            }
            if ride?.pause?.isPaused == true { message = "Jízda je pozastavená. Pokračuj, až budeš připravený." }
            else if !pendingRides.isEmpty { message = "Jízdy čekají na kontrolu." }
        } catch {
            storageFailed = true
            message = "Záznam se nepodařilo přečíst nebo uložit. Původní soubor zůstává v zařízení."
        }
        // Remove orphan activities left by a terminated recording process.
        live.finishOrphans()
    }
    func setAccount(userId: String, odometer: Double) {
        guard UUID(uuidString: userId) != nil, odometer.isFinite, odometer >= 0, !storageFailed else { return }
        let context = RideAccountContext(userId: userId, odometer: odometer)
        guard account?.userId != userId || account?.odometer != odometer || pendingRides.contains(where: { $0.userId == nil }) else { return }
        var migrated = pendingRides
        for index in migrated.indices where migrated[index].userId == nil { migrated[index].userId = userId }
        do {
            try write(RideArchive(active: ride, pending: migrated, account: context))
            pendingRides = migrated; account = context
            UserDefaults.standard.set(false, forKey: "ride-account-disabled")
        } catch { message = "Účet pro spuštění ze zamčené obrazovky se nepodařilo uložit." }
    }
    func clearAccount() {
        UserDefaults.standard.set(true, forKey: "ride-account-disabled")
        guard account != nil, !storageFailed else { return }
        do {
            try write(RideArchive(active: ride, pending: pendingRides, account: nil))
            account = nil
        } catch {
            // Disable system starts even when disk cannot be written. The user must
            // reopen the app to recover storage before any subsequent recording.
            account = nil; storageFailed = true
            message = "Odhlášení v telefonu se nepodařilo zapsat. Spouštění jízdy je zablokované."
        }
    }
    func requestBackgroundPermission() {
        requestingAlways = true
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse: requestingAlways = false; manager.requestAlwaysAuthorization()
        case .authorizedAlways: requestingAlways = false; message = "Spouštění ze zamčené obrazovky je připravené."
        default: requestingAlways = false; message = "V Nastavení → Kniha jízd → Poloha vyber Vždy a zapni Přesnou polohu."
        }
    }
    func startFromSystem() throws -> Bool {
        if ride != nil { return false }
        guard !storageFailed else { throw RideActionError.unavailable(message) }
        guard let account else { throw RideActionError.unavailable("Nejprve otevři Knihu jízd a přihlas se ke svému účtu.") }
        guard manager.authorizationStatus == .authorizedAlways else {
            throw RideActionError.unavailable("Otevři Knihu jízd a povol spouštění ze zamčené obrazovky. V Nastavení polohy vyber Vždy.")
        }
        guard live.enabled else { throw RideActionError.unavailable("V Nastavení → Kniha jízd povol Živé aktivity.") }
        let offset = pendingRides.filter { $0.userId == account.userId }.reduce(0) { $0 + $1.distanceKm }
        let started = try begin(odometer: account.odometer + offset, userId: account.userId, system: true)
        return started
    }
    func start(odometer: Double = 0, userId: String? = nil) {
        guard ride == nil, !storageFailed, let userId, UUID(uuidString: userId) != nil else { return }
        switch manager.authorizationStatus {
        case .notDetermined:
            pendingStart = true; pendingOdometer = odometer; pendingUserId = userId; manager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            do { _ = try begin(odometer: odometer, userId: userId, system: false) }
            catch { message = error.localizedDescription }
        default: message = "Povol polohu aplikaci a zapni polohové služby v Nastavení → Soukromí → Polohové služby."
        }
    }
    private func begin(odometer: Double, userId: String, system: Bool) throws -> Bool {
        guard ride == nil else { return false }
        var started = Ride(); started.odometerStart = odometer; started.userId = userId
        started.pause = RidePauseClock(trackingSinceMs: started.startedAt)
        try write(RideArchive(active: started, pending: pendingRides, account: account))
        do { try live.start(started, required: system) }
        catch {
            // No GPS is started if the system cannot show its visible activity.
            // Keep the durable segment as an interrupted pending ride if rollback fails.
            do { try write(RideArchive(active: nil, pending: pendingRides, account: account)) }
            catch { ride = started; storageFailed = true }
            throw error
        }
        accuracyMetres = nil; lastLocationAtMs = nil; speedKmh = nil
        ride = started; distance.reset()
        message = "Hledám přesnou GPS polohu…"; manager.startUpdatingLocation()
        return true
    }
    func testGps() {
        guard ride == nil else { message = "GPS už zaznamenává jízdu."; return }
        pendingProbe = true
        if manager.authorizationStatus == .notDetermined {
            message = "Žádám o přístup k GPS…"; manager.requestWhenInUseAuthorization()
        } else if manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorizedWhenInUse {
            message = "Hledám GPS polohu…"; manager.requestLocation()
        } else {
            pendingProbe = false; message = "Povol polohu aplikaci a zapni polohové služby v Nastavení → Soukromí → Polohové služby."
        }
    }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        backgroundReady = manager.authorizationStatus == .authorizedAlways
        if requestingAlways && manager.authorizationStatus == .authorizedWhenInUse {
            requestingAlways = false; manager.requestAlwaysAuthorization()
        } else if backgroundReady { requestingAlways = false }
        if manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted {
            pendingStart = false; pendingProbe = false; speedKmh = nil; distance.reset(); message = "Povol polohu aplikaci a zapni polohové služby v Nastavení → Soukromí → Polohové služby."
        }
        if pendingProbe && [.authorizedAlways, .authorizedWhenInUse].contains(manager.authorizationStatus) {
            manager.requestLocation()
        }
        if pendingStart && [.authorizedAlways, .authorizedWhenInUse].contains(manager.authorizationStatus) {
            pendingStart = false; start(odometer: pendingOdometer, userId: pendingUserId)
        }
    }
    func pause() {
        guard var current = ride, current.endedAt == nil, current.pause?.isPaused != true, !storageFailed else { return }
        var clock = current.pause ?? RidePauseClock(trackingSinceMs: current.startedAt)
        clock.pause(at: Date().timeIntervalSince1970 * 1000); current.pause = clock
        do {
            try write(RideArchive(active: current, pending: pendingRides, account: account))
            ride = current; manager.stopUpdatingLocation(); distance.reset()
            speedKmh = nil; accuracyMetres = nil; lastLocationAtMs = nil
            message = "Jízda pozastavena. GPS ani doba jízdy se nepřičítají."
            live.update(current, message: message, force: true)
        } catch { message = "Pauzu se nepodařilo uložit. Jízda dál probíhá; zkus pauzu znovu." }
    }
    func waitForLiveUpdate() async { await live.waitForUpdate() }
    func resumeFromSystem() throws {
        guard let current = ride, current.pause?.isPaused == true else { return }
        guard let account, account.userId == current.userId else {
            throw RideActionError.unavailable("Otevři Knihu jízd a přihlas se k účtu této jízdy.")
        }
        guard backgroundReady else {
            throw RideActionError.unavailable("Pro pokračování ze zamčené obrazovky povol polohu Vždy v Nastavení → Kniha jízd → Poloha.")
        }
        guard live.enabled else { throw RideActionError.unavailable("V Nastavení → Kniha jízd povol Živé aktivity.") }
        resume()
        guard ride?.pause?.isPaused == false else { throw RideActionError.unavailable(message) }
    }
    func resume() {
        guard var current = ride, var clock = current.pause, clock.isPaused, current.endedAt == nil, !storageFailed else { return }
        guard [.authorizedAlways, .authorizedWhenInUse].contains(manager.authorizationStatus) else {
            message = "Pro pokračování povol polohu aplikaci v Nastavení."; return
        }
        clock.resume(at: Date().timeIntervalSince1970 * 1000); current.pause = clock
        do {
            try write(RideArchive(active: current, pending: pendingRides, account: account))
            ride = current; distance.reset(); speedKmh = nil; accuracyMetres = nil; lastLocationAtMs = nil
            message = "Hledám přesnou GPS polohu…"; manager.startUpdatingLocation()
            live.resume(current, message: message)
        } catch { message = "Pokračování se nepodařilo uložit. Jízda zůstává pozastavená." }
    }
    func retry() {
        guard ride != nil, ride?.endedAt == nil, ride?.pause?.isPaused != true, !storageFailed else { return }
        manager.stopUpdatingLocation(); distance.reset()
        accuracyMetres = nil; lastLocationAtMs = nil; speedKmh = nil
        manager.startUpdatingLocation(); message = "Hledám přesnou GPS polohu…"
    }
    @discardableResult func stop() -> Bool {
        pendingStart = false
        guard var completed = ride else { return true }
        manager.stopUpdatingLocation(); distance.reset(); speedKmh = nil
        let endedAt = Date().timeIntervalSince1970 * 1000
        completed.endedAt = endedAt
        completed.pause?.resume(at: endedAt)
        var queued = pendingRides; queued.append(completed)
        do {
            try write(RideArchive(active: nil, pending: queued, account: account))
            pendingRides = queued; ride = nil; storageFailed = false
            live.finish(completed)
            message = "Jízda čeká na kontrolu. Můžeš spustit další."
            return true
        } catch {
            // Keep the segment and prevent a new start; retrying Stop is safe.
            message = "Jízdu se nepodařilo uložit do telefonu. Zkus ukončení znovu."
            return false
        }
    }
    func acknowledge(_ id: String, userId: String) {
        guard pendingRides.contains(where: { $0.id == id && $0.userId == userId }), !storageFailed else { return }
        let remaining = pendingRides.filter { $0.id != id }
        do {
            try write(RideArchive(active: ride, pending: remaining, account: account))
            pendingRides = remaining
            if ride == nil { message = remaining.isEmpty ? "Připraveno k jízdě" : "Jízdy čekají na kontrolu." }
        } catch { message = "Jízda zůstává v telefonu. Odebrání z fronty se nepodařilo uložit." }
    }
    private func write(_ archive: RideArchive) throws {
        try JSONEncoder().encode(archive).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    private func persist() {
        do { try write(RideArchive(active: ride, pending: pendingRides, account: account)) }
        catch {
            manager.stopUpdatingLocation(); storageFailed = true; speedKmh = nil
            message = "Zápis do zařízení selhal. GPS je zastavená, aby se neztratila další jízda: \(error.localizedDescription)"
        }
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        if pendingProbe && ride == nil {
            pendingProbe = false
            if let point = locations.last, point.horizontalAccuracy >= 0 {
                message = "GPS funguje. Přesnost přibližně ±\(Int(point.horizontalAccuracy)) m."
            } else { message = "GPS zatím nezískala použitelnou polohu." }
            return
        }
        guard ride != nil, ride?.endedAt == nil, ride?.pause?.isPaused != true, !storageFailed else { return }
        for point in locations.sorted(by: { $0.timestamp < $1.timestamp }) {
            // iOS may deliver a batch late. Keep its valid points from this ride;
            // reject pre-start cached fixes instead of dropping all fixes >30s old.
            guard let startedAt = ride?.startedAt,
                  DistanceAccumulator.belongsToRide(point.timestamp, startedAtMs: startedAt),
                  ride?.pause?.accepts(point.timestamp) != false else { continue }
            guard point.horizontalAccuracy >= 0 else {
                distance.reset(); speedKmh = nil; message = "GPS zatím nemá použitelnou polohu."; continue
            }
            accuracyMetres = point.horizontalAccuracy
            lastLocationAtMs = point.timestamp.timeIntervalSince1970 * 1000
            guard point.horizontalAccuracy <= 60 else {
                distance.reset(); speedKmh = nil
                message = manager.accuracyAuthorization == .reducedAccuracy
                    ? "Zapni Přesnou polohu pro lepší měření."
                    : "Slabá GPS: přesnost přibližně ±\(Int(point.horizontalAccuracy)) m. Vzdálenost zatím nepřičítám."
                continue
            }
            guard let sample = distance.consume(point) else {
                speedKmh = nil; message = "GPS bod přeskočen: neplatný čas nebo nepřesný skok polohy."; continue
            }
            ride?.distanceKm += sample.metres / 1000
            if sample.appendPoint {
                ride?.route.append([point.coordinate.latitude, point.coordinate.longitude, sample.startsSegment ? 1 : 0])
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
            }
            let fresh = abs(point.timestamp.timeIntervalSinceNow) < 30
            speedKmh = fresh && point.speed.isFinite && point.speed >= 0 && point.speedAccuracy >= 0 ? point.speed * 3.6 : nil
            message = manager.accuracyAuthorization == .reducedAccuracy ? "Zapni Přesnou polohu pro lepší měření." : (fresh ? "GPS zaznamenává jízdu" : "Zpracovávám odložené GPS polohy…")
            persist()
            if let ride { live.update(ride, message: message) }
        }
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard ride?.pause?.isPaused != true else { return }
        pendingProbe = false; distance.reset(); speedKmh = nil; message = "GPS: \(error.localizedDescription)"
    }
}
