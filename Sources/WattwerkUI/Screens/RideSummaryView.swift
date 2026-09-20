import SwiftUI
import WattwerkCore

/// Shown the moment a ride ends: the numbers, and the decision to keep it or not.
struct RideSummaryView: View {
    let model: AppModel
    let record: SessionRecord

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(record.completed ? "Einheit geschafft" : "Einheit beendet")
                        .font(.system(size: 32 * Theme.scale, weight: .bold, design: .rounded))
                    Text(record.workoutName)
                        .font(.system(size: 17 * Theme.scale))
                        .foregroundStyle(.secondary)
                }

                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 150 * Theme.scale), spacing: 16)],
                    spacing: 16
                ) {
                    MetricTile(label: "Dauer", value: Formatting.clock(record.duration), size: .large)
                    MetricTile(label: "Ø Leistung", value: "\(record.averagePower)", unit: "W", size: .large)
                    MetricTile(label: "NP", value: "\(record.normalizedPower)", unit: "W", size: .large)
                    MetricTile(label: "Belastung", value: "\(record.trainingStressScore)", unit: "TSS", size: .large)
                    MetricTile(label: "Arbeit", value: "\(record.kilojoules)", unit: "kJ", size: .large)
                    MetricTile(
                        label: "Ø Puls",
                        value: record.averageHeartRate.map(String.init) ?? "--",
                        unit: "bpm",
                        size: .large,
                        tint: Theme.heartRate
                    )
                }
                .padding(18)
                .cardBackground()

                if !record.timeInZone.isEmpty {
                    ZoneBreakdown(buckets: record.timeInZone, total: record.duration)
                }

                HStack(spacing: 14) {
                    Button {
                        model.finishRide(save: true)
                    } label: {
                        Label("Speichern", systemImage: "square.and.arrow.down")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                    }
                    .buttonStyle(.borderedProminent)

                    Button(role: .destructive) {
                        model.finishRide(save: false)
                    } label: {
                        Label("Verwerfen", systemImage: "trash")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                    }
                    .buttonStyle(.bordered)
                }
            }
            .padding(28)
            .frame(maxWidth: 900 * Theme.scale)
            .frame(maxWidth: .infinity)
        }
    }
}

/// Horizontal bars: how much time was spent in each training zone.
struct ZoneBreakdown: View {
    let buckets: [SessionRecord.ZoneBucket]
    let total: TimeInterval

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Zeit in den Zonen")
                .font(.system(size: 17 * Theme.scale, weight: .semibold))

            ForEach(buckets, id: \.zone) { bucket in
                HStack(spacing: 12) {
                    Text("\(bucket.zone.shortName) \(bucket.zone.localizedName)")
                        .font(.system(size: 13 * Theme.scale, weight: .medium))
                        .frame(width: 140 * Theme.scale, alignment: .leading)

                    GeometryReader { geometry in
                        let fraction = total > 0 ? bucket.seconds / total : 0
                        Capsule()
                            .fill(Theme.zoneColor(bucket.zone))
                            .frame(width: max(geometry.size.width * fraction, 3))
                    }
                    .frame(height: 12 * Theme.scale)

                    Text(Formatting.clock(bucket.seconds))
                        .font(.system(size: 13 * Theme.scale))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                        .frame(width: 70 * Theme.scale, alignment: .trailing)
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
    }
}
