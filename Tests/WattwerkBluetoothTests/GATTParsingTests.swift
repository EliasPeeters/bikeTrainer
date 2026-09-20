import Foundation
import Testing
@testable import WattwerkBluetooth
@testable import WattwerkCore

@Suite("Indoor Bike Data")
struct IndoorBikeDataTests {
    @Test("Geschwindigkeit, Trittfrequenz und Leistung")
    func fullFrame() throws {
        // Flags 0x0044: More-Data-Bit frei (also Geschwindigkeit dabei),
        // Bit 2 Trittfrequenz, Bit 6 Leistung.
        let data = Data([0x44, 0x00, 0xBE, 0x0A, 0xB4, 0x00, 0xD2, 0x00])
        let parsed = try #require(IndoorBikeData(data: data))
        #expect(parsed.instantaneousSpeed == 27.5)
        #expect(parsed.instantaneousCadence == 90)
        #expect(parsed.instantaneousPower == 210)
        #expect(parsed.heartRate == nil)
    }

    @Test("Gesetztes More-Data-Bit bedeutet: keine Geschwindigkeit")
    func moreDataBitInverts() throws {
        let data = Data([0x45, 0x00, 0xB4, 0x00, 0xD2, 0x00])
        let parsed = try #require(IndoorBikeData(data: data))
        #expect(parsed.instantaneousSpeed == nil)
        #expect(parsed.instantaneousCadence == 90)
        #expect(parsed.instantaneousPower == 210)
    }

    @Test("Puls vom Trainer")
    func heartRateField() throws {
        let data = Data([0x45, 0x02, 0xB4, 0x00, 0xD2, 0x00, 0x8C])
        let parsed = try #require(IndoorBikeData(data: data))
        #expect(parsed.heartRate == 140)
    }

    @Test("Negative Leistung beim Ausrollen")
    func negativePower() throws {
        let data = Data([0x41, 0x00, 0xFB, 0xFF])
        let parsed = try #require(IndoorBikeData(data: data))
        #expect(parsed.instantaneousPower == -5)
    }

    @Test("Distanz ist ein 24-Bit-Wert")
    func distanceIsThreeBytes() throws {
        let data = Data([0x51, 0x00, 0x40, 0xE2, 0x01, 0xD2, 0x00])
        let parsed = try #require(IndoorBikeData(data: data))
        #expect(parsed.totalDistance == 123_456)
        #expect(parsed.instantaneousPower == 210)
    }

    @Test("Das Energiefeld wird korrekt übersprungen")
    func skipsEnergyBlock() throws {
        // Bit 8 Energie (2 + 2 + 1 Byte), danach Bit 9 Puls.
        let data = Data([0x01, 0x03, 0x64, 0x00, 0xC8, 0x00, 0x05, 0x8C])
        let parsed = try #require(IndoorBikeData(data: data))
        #expect(parsed.totalEnergy == 100)
        #expect(parsed.heartRate == 140)
    }

    @Test("Abgeschnittene Pakete stürzen nicht ab")
    func truncatedPayload() throws {
        let parsed = try #require(IndoorBikeData(data: Data([0x44, 0x00, 0xBE])))
        #expect(parsed.instantaneousSpeed == nil)
        #expect(parsed.instantaneousPower == nil)
        #expect(IndoorBikeData(data: Data([0x44])) == nil)
        #expect(IndoorBikeData(data: Data()) == nil)
    }
}

@Suite("Herzfrequenz")
struct HeartRateMeasurementTests {
    @Test("8-Bit-Format")
    func eightBit() throws {
        let parsed = try #require(HeartRateMeasurement(data: Data([0x00, 0x48])))
        #expect(parsed.beatsPerMinute == 72)
        #expect(parsed.sensorContact == .notSupported)
        #expect(parsed.rrIntervals.isEmpty)
    }

    @Test("16-Bit-Format")
    func sixteenBit() throws {
        let parsed = try #require(HeartRateMeasurement(data: Data([0x01, 0x2C, 0x01])))
        #expect(parsed.beatsPerMinute == 300)
    }

    @Test("Hautkontakt und RR-Intervalle")
    func contactAndIntervals() throws {
        let parsed = try #require(HeartRateMeasurement(data: Data([0x16, 0x48, 0x00, 0x04, 0x00, 0x02])))
        #expect(parsed.beatsPerMinute == 72)
        #expect(parsed.sensorContact == .detected)
        #expect(parsed.rrIntervals.count == 2)
        #expect(parsed.rrIntervals[0] == 1.0)
        #expect(parsed.rrIntervals[1] == 0.5)
    }

    @Test("Fehlender Hautkontakt wird gemeldet")
    func contactMissing() throws {
        let parsed = try #require(HeartRateMeasurement(data: Data([0x04, 0x3C])))
        #expect(parsed.sensorContact == .notDetected)
    }

    @Test("Leeres Paket liefert nichts")
    func empty() {
        #expect(HeartRateMeasurement(data: Data()) == nil)
        #expect(HeartRateMeasurement(data: Data([0x00])) == nil)
    }
}

@Suite("Fitness Machine Control Point")
struct ControlPointTests {
    @Test("Zielleistung wird als vorzeichenbehaftete 16-Bit-Zahl gesendet")
    func targetPowerEncoding() {
        #expect(Array(FitnessMachineControlPoint.setTargetPower(250)) == [0x05, 0xFA, 0x00])
        #expect(Array(FitnessMachineControlPoint.setTargetPower(0)) == [0x05, 0x00, 0x00])
        #expect(Array(FitnessMachineControlPoint.setTargetPower(-10)) == [0x05, 0xF6, 0xFF])
        // Unsinnige Werte werden auf den Wertebereich begrenzt statt zu überlaufen.
        #expect(Array(FitnessMachineControlPoint.setTargetPower(100_000)) == [0x05, 0xFF, 0x7F])
    }

    @Test("Steuerbefehle")
    func commands() {
        #expect(Array(FitnessMachineControlPoint.requestControl()) == [0x00])
        #expect(Array(FitnessMachineControlPoint.reset()) == [0x01])
        #expect(Array(FitnessMachineControlPoint.start()) == [0x07])
        #expect(Array(FitnessMachineControlPoint.pause()) == [0x08, 0x02])
        #expect(Array(FitnessMachineControlPoint.stop()) == [0x08, 0x01])
    }

    @Test("Antworten werden ausgewertet")
    func responses() throws {
        let success = try #require(FitnessMachineControlPoint.parseResponse(Data([0x80, 0x05, 0x01])))
        #expect(success.isSuccess)
        #expect(success.requestOpCode == 0x05)
        #expect(success.error == nil)

        let denied = try #require(FitnessMachineControlPoint.parseResponse(Data([0x80, 0x00, 0x05])))
        #expect(!denied.isSuccess)
        if case .controlNotPermitted = denied.error {} else {
            Issue.record("Erwartet wurde „Steuerung nicht erlaubt“")
        }

        let unsupported = try #require(FitnessMachineControlPoint.parseResponse(Data([0x80, 0x05, 0x02])))
        if case .notSupported = unsupported.error {} else {
            Issue.record("Erwartet wurde „nicht unterstützt“")
        }

        // Alles, was kein Antwortcode ist, wird ignoriert.
        #expect(FitnessMachineControlPoint.parseResponse(Data([0x01, 0x02, 0x03])) == nil)
        #expect(FitnessMachineControlPoint.parseResponse(Data([0x80, 0x05])) == nil)
    }

    @Test("Simulationsparameter für den späteren Streckenmodus")
    func simulation() {
        let data = Array(FitnessMachineControlPoint.setSimulation(grade: 5.0))
        #expect(data[0] == 0x11)
        // 5,00 % werden als 500 in Hundertstel übertragen.
        #expect(data[3] == 0xF4)
        #expect(data[4] == 0x01)
    }
}

@Suite("Trainer-Eigenschaften")
struct FeatureTests {
    @Test("Feature-Bits")
    func features() throws {
        let data = Data([0x06, 0x40, 0x00, 0x00, 0x08, 0x20, 0x00, 0x00])
        let feature = try #require(FitnessMachineFeature(data: data))
        #expect(feature.supportsCadence)
        #expect(feature.supportsTotalDistance)
        #expect(feature.supportsPowerMeasurement)
        #expect(feature.supportsPowerTarget)
        #expect(feature.supportsSimulation)
        #expect(!feature.supportsResistanceTarget)
        #expect(!feature.supportsHeartRateMeasurement)
        #expect(FitnessMachineFeature(data: Data([0x00, 0x00])) == nil)
    }

    @Test("Leistungsbereich")
    func powerRange() throws {
        let range = try #require(SupportedPowerRange(data: Data([0x00, 0x00, 0xD0, 0x07, 0x01, 0x00])))
        #expect(range.minimum == 0)
        #expect(range.maximum == 2000)
        #expect(range.increment == 1)
        #expect(range.range == 0...2000)

        // Ein negatives Minimum (Ausrollen) wird für die Zielvorgabe auf null gezogen.
        let negative = try #require(SupportedPowerRange(data: Data([0x9C, 0xFF, 0xD0, 0x07, 0x01, 0x00])))
        #expect(negative.minimum == -100)
        #expect(negative.range == 0...2000)
    }
}

@Suite("Cycling Power")
struct CyclingPowerTests {
    @Test("Leistung mit Kurbeldaten")
    func crankData() throws {
        let data = Data([0x20, 0x00, 0xC8, 0x00, 0x64, 0x00, 0x00, 0x08])
        let parsed = try #require(CyclingPowerMeasurement(data: data))
        #expect(parsed.instantaneousPower == 200)
        #expect(parsed.cumulativeCrankRevolutions == 100)
        #expect(parsed.lastCrankEventTime == 2048)
    }

    @Test("Rad- und Kurbeldaten zusammen")
    func wheelAndCrank() throws {
        let data = Data([
            0x30, 0x00,
            0xC8, 0x00,
            0x10, 0x00, 0x00, 0x00,
            0x00, 0x04,
            0x64, 0x00,
            0x00, 0x08,
        ])
        let parsed = try #require(CyclingPowerMeasurement(data: data))
        #expect(parsed.cumulativeWheelRevolutions == 16)
        #expect(parsed.cumulativeCrankRevolutions == 100)
        #expect(parsed.lastCrankEventTime == 2048)
    }

    @Test("Nur Leistung, keine Zusatzfelder")
    func powerOnly() throws {
        let parsed = try #require(CyclingPowerMeasurement(data: Data([0x00, 0x00, 0x2C, 0x01])))
        #expect(parsed.instantaneousPower == 300)
        #expect(parsed.cumulativeCrankRevolutions == nil)
        #expect(CyclingPowerMeasurement(data: Data([0x00, 0x00])) == nil)
    }

    @Test("Trittfrequenz aus Kurbelzählern")
    func cadenceFromCounters() {
        var tracker = CadenceTracker()
        // Die erste Messung ist nur die Referenz.
        #expect(tracker.update(revolutions: 100, eventTime: 2048) == nil)
        // Fünf Umdrehungen in fünf Sekunden sind 60 U/min.
        let cadence = tracker.update(revolutions: 105, eventTime: 2048 + 5 * 1024)
        #expect(cadence == 60)
    }

    @Test("Überlauf der Zähler wird berücksichtigt")
    func cadenceWrapAround() {
        var tracker = CadenceTracker()
        _ = tracker.update(revolutions: 65534, eventTime: 64500)
        // Beide Zähler laufen über: 4 Umdrehungen in 2,5 Sekunden sind 96 U/min.
        let cadence = tracker.update(revolutions: 2, eventTime: 1524)
        #expect(cadence == 96)
    }

    @Test("Unsinnige Werte werden verworfen")
    func rejectsImplausibleCadence() {
        var tracker = CadenceTracker()
        _ = tracker.update(revolutions: 0, eventTime: 0)
        #expect(tracker.update(revolutions: 100, eventTime: 1024) == nil)
    }
}

@Suite("Byte-Leser")
struct ByteReaderTests {
    @Test("Little Endian über alle Breiten")
    func readsLittleEndian() {
        var reader = ByteReader(Data([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A]))
        #expect(reader.uint8() == 0x01)
        #expect(reader.uint16() == 0x0302)
        #expect(reader.uint24() == 0x060504)
        #expect(reader.uint32() == 0x0A090807)
        #expect(reader.uint8() == nil)
    }

    @Test("Über das Ende hinaus wird nichts gelesen")
    func boundsChecked() {
        var reader = ByteReader(Data([0xFF]))
        #expect(reader.uint16() == nil)
        #expect(reader.uint8() == 0xFF)
        #expect(reader.remaining == 0)
    }

    @Test("Vorzeichenbehaftete Werte")
    func signedValues() {
        var reader = ByteReader(Data([0xFB, 0xFF, 0x9C, 0xFF]))
        #expect(reader.int16() == -5)
        #expect(reader.int16() == -100)
    }
}
