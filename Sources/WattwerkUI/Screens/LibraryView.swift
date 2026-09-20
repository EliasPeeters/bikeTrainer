import SwiftUI
import WattwerkCore

/// Die Bibliothek: Reihen von Programmen, wie man es von Streaming-Diensten kennt.
///
/// Welche Reihen es gibt, entscheidet angemeldet der Server - dadurch zeigen
/// App und Web-Portal dasselbe. Ohne Konto oder ohne Netz werden sie lokal
/// gebaut, damit hier nie eine leere Seite steht.
struct LibraryView: View {
    let model: AppModel
    @State private var path: [Workout] = []
    @State private var editedWorkout: Workout?

    private var ftp: Int { model.settings.rider.ftp }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 28 * Theme.scale) {
                    header

                    ForEach(model.libraryRows) { row in
                        WorkoutRowView(row: row, ftp: ftp) { workout in
                            path.append(workout)
                        }
                    }

                    if !model.collections.isEmpty {
                        collectionsSection
                    }
                }
                .padding(.vertical, 24)
            }
            .background(Theme.background)
            .navigationTitle("Training")
            .navigationDestination(for: Workout.self) { workout in
                WorkoutDetailView(model: model, workout: workout)
            }
            .task {
                // Beim Öffnen die Reihen auffrischen - eine Einheit auf einem
                // anderen Gerät soll hier ankommen, ohne die App neu zu starten.
                await model.sync.refreshDiscovery()
            }
            #if !os(tvOS)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        editedWorkout = Workout(
                            name: "Neues Programm",
                            segments: [
                                .ramp(600, fromPercentFTP: 0.45, toPercentFTP: 0.70, title: "Einfahren"),
                                .steady(300, percentFTP: 0.90, title: "Block 1"),
                                .ramp(300, fromPercentFTP: 0.55, toPercentFTP: 0.40, title: "Ausfahren"),
                            ]
                        )
                    } label: {
                        Label("Neues Programm", systemImage: "plus")
                    }
                }
            }
            .sheet(item: $editedWorkout) { workout in
                WorkoutEditorView(workout: workout, ftp: ftp) { saved in
                    model.save(saved)
                }
            }
            #endif
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Training")
                    .font(.system(size: 28 * Theme.scale, weight: .bold, design: .rounded))
                Text(model.account.isSignedIn
                    ? "Deine Bibliothek, überall gleich."
                    : "Lokale Bibliothek. Mit Konto liegt sie in der Cloud.")
                    .font(.system(size: 14 * Theme.scale))
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if model.sync.isSyncing {
                Label("Abgleich läuft", systemImage: "arrow.triangle.2.circlepath")
                    .font(.system(size: 12 * Theme.scale))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 24)
    }

    private var collectionsSection: some View {
        VStack(alignment: .leading, spacing: 14 * Theme.scale) {
            Text("Deine Ordner")
                .font(.system(size: 20 * Theme.scale, weight: .semibold))
                .padding(.horizontal, 24)

            ForEach(model.collections, id: \.id) { collection in
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        Image(systemName: "folder.fill")
                            .foregroundStyle(Theme.accent)
                        Text(collection.name)
                            .font(.system(size: 16 * Theme.scale, weight: .medium))
                        Text("\(collection.workouts.count)")
                            .font(.system(size: 12 * Theme.scale))
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 24)

                    if collection.workouts.isEmpty {
                        Text("Noch leer. Im Web-Portal lassen sich Programme hineinlegen.")
                            .font(.system(size: 13 * Theme.scale))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 24)
                    } else {
                        cardScroller(collection.workouts.map { $0.makeWorkout() })
                    }
                }
            }
        }
    }

    private func cardScroller(_ workouts: [Workout]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 16) {
                ForEach(workouts) { workout in
                    Button {
                        path.append(workout)
                    } label: {
                        WorkoutCard(workout: workout, ftp: ftp)
                            .frame(width: 260 * Theme.scale)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 24)
        }
    }
}

/// Eine waagerechte Reihe mit Überschrift.
struct WorkoutRowView: View {
    let row: LibraryRow
    let ftp: Int
    let onSelect: (Workout) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12 * Theme.scale) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(row.title)
                    .font(.system(size: 20 * Theme.scale, weight: .semibold))
                if let subtitle = row.subtitle {
                    Text(subtitle)
                        .font(.system(size: 13 * Theme.scale))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 24)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 16) {
                    ForEach(row.workouts) { workout in
                        Button {
                            onSelect(workout)
                        } label: {
                            WorkoutCard(workout: workout, ftp: ftp)
                                .frame(width: 260 * Theme.scale)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 24)
            }
        }
    }
}

struct WorkoutCard: View {
    let workout: Workout
    let ftp: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            WorkoutProfileChart(workout: workout, ftp: ftp, showsGrid: false)
                .frame(height: 84 * Theme.scale)

            Text(workout.name)
                .font(.system(size: 17 * Theme.scale, weight: .semibold))
                .lineLimit(1)

            Text(workout.summary)
                .font(.system(size: 13 * Theme.scale))
                .foregroundStyle(.secondary)
                .lineLimit(2, reservesSpace: true)

            HStack(spacing: 12) {
                Label(Formatting.compactDuration(workout.duration), systemImage: "clock")
                Label("\(workout.plannedTSS(ftp: ftp)) TSS", systemImage: "flame")
                Spacer()
                if workout.visibility == .public && !workout.isBuiltIn {
                    Image(systemName: "globe")
                        .foregroundStyle(Theme.positive)
                } else if !workout.isBuiltIn {
                    Image(systemName: "lock")
                }
            }
            .font(.system(size: 12 * Theme.scale, weight: .medium))
            .foregroundStyle(.secondary)

            if let owner = workout.ownerName, !workout.isBuiltIn {
                Text("von \(owner)")
                    .font(.system(size: 11 * Theme.scale))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
    }
}
