import Foundation
import Observation
import WattwerkCore

/// A fake trainer with a plausible rider attached to it.
///
/// This exists for two reasons: the tvOS app has to be developed without a bike
/// in front of the TV, and a demo mode is the fastest way to see whether the
/// ride screen actually works. It implements the same `TrainerControl` port as
/// the real thing, so nothing above it knows the difference.
@MainActor
@Observable
public final class SimulatedTrainer: TrainerControl {
    public let displayName = "Simulator"
    public let supportsTargetPower = true
    public let supportedPowerRange: ClosedRange<Int>? = 0...2000

    public private(set) var isRunning = false
    public private(set) var targetWatts: Int = 120

    @ObservationIgnored public var onReading: ((TrainerReading) -> Void)?

    /// How closely the simulated rider follows the target. 1.0 is a machine,
    /// 0.0 is someone watching television.
    @ObservationIgnored public var discipline: Double = 0.85

    @ObservationIgnored private var currentPower: Double = 100
    @ObservationIgnored private var currentCadence: Double = 88
    @ObservationIgnored private var currentHeartRate: Double = 95
    @ObservationIgnored private var distance: Double = 0
    @ObservationIgnored private var task: Task<Void, Never>?
    @ObservationIgnored private let interval: TimeInterval = 1.0

    public init() {}

    deinit { task?.cancel() }

    public func start() {
        guard task == nil else { return }
        isRunning = true
        task = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard let self, !Task.isCancelled else { return }
                self.step()
            }
        }
    }

    public func stop() {
        task?.cancel()
        task = nil
        isRunning = false
    }

    // MARK: TrainerControl

    public func requestControl() async throws {
        start()
    }

    public func setTargetPower(_ watts: Int) async throws {
        targetWatts = max(0, watts)
        start()
    }

    public func releaseControl() async throws {
        // Free riding: settle into a comfortable endurance pace.
        targetWatts = 130
    }

    // MARK: The rider model

    /// One second of simulated riding. Driven by the ticker; also called directly
    /// by the integration tests so they do not have to wait in real time.
    func step() {
        let target = Double(targetWatts)

        // First order lag towards the target, as if the rider needed a moment to
        // react, plus noise that scales with how hard the effort is.
        let gap = target - currentPower
        currentPower += gap * (0.25 + 0.5 * discipline)
        let noiseScale = max(4, target * 0.03)
        currentPower += Double.random(in: -noiseScale...noiseScale)
        currentPower = max(0, currentPower)

        // Cadence drifts around 90 and climbs a little when it gets hard.
        let cadenceTarget = 86 + (target > 250 ? 6.0 : 0) + Double.random(in: -3...3)
        currentCadence += (cadenceTarget - currentCadence) * 0.3
        if currentPower < 20 { currentCadence *= 0.6 }

        // Heart rate chases power with a long time constant, which is what makes
        // interval screens look right during a demo.
        let heartRateTarget = 70 + currentPower * 0.32
        currentHeartRate += (heartRateTarget - currentHeartRate) * 0.06
        currentHeartRate += Double.random(in: -1...1)

        // P = k * v^3 with a k that puts 200 W at roughly 36 km/h.
        let metersPerSecond = pow(max(currentPower, 1) / 0.20, 1.0 / 3.0)
        distance += metersPerSecond * interval

        onReading?(
            TrainerReading(
                power: Int(currentPower.rounded()),
                cadence: Int(currentCadence.rounded()),
                speed: metersPerSecond * 3.6,
                distance: distance,
                heartRate: Int(currentHeartRate.rounded())
            )
        )
    }

    public func reset() {
        currentPower = 100
        currentCadence = 88
        currentHeartRate = 95
        distance = 0
    }
}
