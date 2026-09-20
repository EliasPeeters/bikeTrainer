import SwiftUI
import WattwerkCore

/// The workout catalogue.
struct LibraryView: View {
    let model: AppModel
    @State private var path: [Workout] = []
    @State private var editedWorkout: Workout?

    private var columns: [GridItem] {
        #if os(tvOS)
        [GridItem(.adaptive(minimum: 420), spacing: 32)]
        #else
        [GridItem(.adaptive(minimum: 280), spacing: 18)]
        #endif
    }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                LazyVGrid(columns: columns, spacing: 18) {
                    ForEach(model.library.allWorkouts) { workout in
                        Button {
                            path.append(workout)
                        } label: {
                            WorkoutCard(workout: workout, ftp: model.settings.rider.ftp)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(24)
            }
            .background(Theme.background)
            .navigationTitle("Training")
            .navigationDestination(for: Workout.self) { workout in
                WorkoutDetailView(model: model, workout: workout)
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
                WorkoutEditorView(workout: workout, ftp: model.settings.rider.ftp) { saved in
                    model.save(saved)
                }
            }
            #endif
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

            HStack(spacing: 14) {
                Label(Formatting.compactDuration(workout.duration), systemImage: "clock")
                Label("\(workout.plannedTSS(ftp: ftp)) TSS", systemImage: "flame")
                if !workout.isBuiltIn {
                    Image(systemName: "pencil.circle.fill")
                        .foregroundStyle(Theme.accent)
                }
            }
            .font(.system(size: 12 * Theme.scale, weight: .medium))
            .foregroundStyle(.secondary)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground()
    }
}
