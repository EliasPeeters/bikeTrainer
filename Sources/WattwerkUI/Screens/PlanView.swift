import SwiftUI
import WattwerkCore

/// Der Wochenplan: Montag bis Sonntag, an jedem Tag die Programme, die dran sind.
///
/// Einmal angelegt, gilt er jede Woche - man plant also nicht Termine, sondern
/// eine Gewohnheit („dienstags Sweet Spot“). Was in dieser Woche schon gefahren
/// wurde, ist abgehakt.
///
/// Geblättert wird wie im Web-Portal durch das, was gefahren wurde: dieselbe
/// Vorlage, gelegt gegen eine vergangene oder kommende Woche. Abgehakt zählt
/// dabei jedes Gerät, nicht nur dieses - die Einheiten der gezeigten Woche
/// kommen dafür vom Server.
///
/// Auf dem Mac öffnet ein Klick auf einen Eintrag das Programm, alles andere
/// steht im Menü daneben. Auf dem Apple TV gibt es kein Kontextmenü, das man
/// sieht - dort fragt ein Druck auf den Eintrag, was passieren soll.
struct PlanView: View {
    let model: AppModel
    @State private var path: [Workout] = []
    @State private var pickerDay: Weekday?
    @State private var actionEntry: PlanEntry?
    @State private var movingEntry: PlanEntry?
    /// 0 ist diese Woche, -1 die letzte, 1 die nächste.
    @State private var weekOffset = 0

    private var ftp: Int { model.settings.rider.ftp }

    /// Irgendein Tag der gezeigten Woche - heute, um `weekOffset` Wochen verschoben.
    private var shownDate: Date {
        Calendar.current.date(byAdding: .day, value: 7 * weekOffset, to: Date()) ?? Date()
    }

    var body: some View {
        let days = model.planWeek(containing: shownDate)
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 22 * Theme.scale) {
                    header
                    weekNavigation
                    summary(days)
                        .padding(.horizontal, Theme.pageInset)

                    VStack(spacing: 14 * Theme.scale) {
                        ForEach(days) { day in
                            dayRow(day)
                        }
                    }
                }
                .padding(.vertical, Theme.pageInset * 0.6)
            }
            .background(Theme.background)
            .sectionTitle("Wochenplan")
            .navigationDestination(for: Workout.self) { workout in
                WorkoutDetailView(model: model, workout: workout)
            }
        }
        .task {
            // Was im Web, am Mac oder über den MCP-Server umgeplant wurde, soll
            // beim Öffnen hier stehen - nicht erst nach einem Neustart der App.
            await model.sync.refreshPlan()
        }
        .task(id: weekOffset) {
            await model.refreshRides(forWeekOf: shownDate)
        }
        .sheet(item: $pickerDay) { weekday in
            PlanWorkoutPicker(model: model, weekday: weekday)
        }
        .confirmationDialog(
            actionEntry.map { model.workout(for: $0)?.name ?? $0.workoutName } ?? "",
            isPresented: Binding(
                get: { actionEntry != nil },
                set: { if !$0 { actionEntry = nil } }
            ),
            titleVisibility: .visible,
            presenting: actionEntry
        ) { entry in
            if let workout = model.workout(for: entry) {
                Button("Einheit starten") { model.startRide(workout) }
                    .disabled(!model.hasPowerSource)
                Button("Programm ansehen") { path.append(workout) }
            }
            Button("Auf anderen Tag legen") {
                // Ein Dialog kann keinen zweiten öffnen, solange er selbst noch
                // steht - erst wenn er weg ist.
                DispatchQueue.main.async { movingEntry = entry }
            }
            Button("Aus dem Plan nehmen", role: .destructive) { model.removePlanEntry(entry) }
            Button("Abbrechen", role: .cancel) {}
        }
        .confirmationDialog(
            "Auf welchen Tag?",
            isPresented: Binding(
                get: { movingEntry != nil },
                set: { if !$0 { movingEntry = nil } }
            ),
            titleVisibility: .visible,
            presenting: movingEntry
        ) { entry in
            ForEach(Weekday.allCases.filter { $0 != entry.weekday }) { weekday in
                Button(weekday.name) { model.movePlanEntry(entry, to: weekday) }
            }
            Button("Abbrechen", role: .cancel) {}
        }
    }

    // MARK: Kopf

    private var header: some View {
        VStack(alignment: .leading, spacing: 3) {
            #if !os(tvOS)
            Text("Wochenplan")
                .font(.system(size: 28 * Theme.scale, weight: .bold, design: .rounded))
            #endif
            Text(model.plan.isEmpty
                ? "Leg einmal fest, was an welchem Tag dran ist. Der Plan gilt dann jede Woche."
                : "Gilt jede Woche. Gefahrene Einheiten werden abgehakt.")
                .font(.system(size: 14 * Theme.scale))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, Theme.pageInset)
    }

    // MARK: Wochen

    /// ‹ Diese Woche › - und ein Weg zurück, sobald man woanders ist.
    private var weekNavigation: some View {
        let start = TrainingWeek.start(of: shownDate)
        let end = Calendar.current.date(byAdding: .day, value: 6, to: start) ?? start
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 16 * Theme.scale) {
                Button {
                    weekOffset -= 1
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16 * Theme.scale, weight: .semibold))
                        .frame(minWidth: 24 * Theme.scale)
                }
                .accessibilityLabel("Vorherige Woche")

                VStack(spacing: 2) {
                    Text(Self.relativeWeek(weekOffset))
                        .font(.system(size: 17 * Theme.scale, weight: .semibold))
                    Text("KW \(TrainingWeek.weekNumber(of: start)) · \(Self.dateFormatter.string(from: start)) – \(Self.dateFormatter.string(from: end))")
                        .font(.system(size: 12 * Theme.scale))
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)

                Button {
                    weekOffset += 1
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 16 * Theme.scale, weight: .semibold))
                        .frame(minWidth: 24 * Theme.scale)
                }
                .accessibilityLabel("Nächste Woche")

                if weekOffset != 0 {
                    Button("Diese Woche") { weekOffset = 0 }
                }
            }
            .buttonStyle(.bordered)
            .padding(12 * Theme.scale)
            .cardBackground()
            .focusGroup()

            if weekOffset != 0, !model.plan.isEmpty {
                Text("Der Plan ist für jede Woche derselbe. Was du hier änderst, gilt auch für alle anderen Wochen.")
                    .font(.system(size: 12 * Theme.scale))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, Theme.pageInset)
    }

    static func relativeWeek(_ offset: Int) -> String {
        switch offset {
        case 0: return "Diese Woche"
        case 1: return "Nächste Woche"
        case -1: return "Letzte Woche"
        case let n where n > 1: return "In \(n) Wochen"
        default: return "Vor \(-offset) Wochen"
        }
    }

    private func summary(_ days: [PlanDay]) -> some View {
        let entries = days.flatMap(\.entries)
        let done = days.reduce(0) { $0 + $1.entries.filter($1.isCompleted).count }
        let plannedTSS = entries.reduce(0) { $0 + (model.workout(for: $1)?.plannedTSS(ftp: ftp) ?? 0) }
        let riddenTSS = model.rides(inWeekOf: shownDate).reduce(0) { $0 + $1.trainingStressScore }
        // Eine Woche, die noch nicht begonnen hat, hat nichts Erledigtes -
        // „0 von 5“ klänge dort nach einem Rückstand.
        let isFuture = weekOffset > 0

        return HStack(spacing: 16) {
            MetricTile(label: "Geplant", value: "\(entries.count)", unit: entries.count == 1 ? "Einheit" : "Einheiten")
            MetricTile(
                label: "Erledigt",
                value: isFuture ? "–" : "\(done)",
                unit: isFuture ? nil : "von \(entries.count)",
                tint: !isFuture && done > 0 && done == entries.count ? Theme.positive : .white
            )
            MetricTile(
                label: "Belastung",
                value: isFuture ? "\(plannedTSS)" : "\(riddenTSS)",
                unit: isFuture ? "TSS geplant" : "von \(plannedTSS) TSS"
            )
        }
        .padding(16)
        .cardBackground()
    }

    // MARK: Tage

    private func dayRow(_ day: PlanDay) -> some View {
        HStack(alignment: .center, spacing: 18 * Theme.scale) {
            dayLabel(day)
                .frame(width: 120 * Theme.scale, alignment: .leading)
                .padding(.leading, Theme.pageInset)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14 * Theme.scale) {
                    ForEach(day.entries) { entry in
                        entryCard(entry, in: day)
                    }
                    addButton(day)
                }
                .padding(.trailing, Theme.pageInset)
                .padding(.vertical, Theme.focusBleed)
            }
            .padding(.vertical, -Theme.focusBleed)
            .focusGroup()
        }
        .padding(.vertical, 6 * Theme.scale)
        .background {
            if day.isToday {
                Rectangle().fill(Theme.accent.opacity(0.07))
            }
        }
    }

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "de_DE")
        formatter.dateFormat = "d. MMM"
        return formatter
    }()

    private func dayLabel(_ day: PlanDay) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(day.weekday.name)
                .font(.system(size: 17 * Theme.scale, weight: .semibold))
                .foregroundStyle(day.isToday ? Theme.accent : .white)
            Text(day.isToday ? "Heute" : Self.dateFormatter.string(from: day.date))
                .font(.system(size: 12 * Theme.scale, weight: day.isToday ? .semibold : .regular))
                .foregroundStyle(day.isToday ? Theme.accent : .secondary)
        }
    }

    @ViewBuilder
    private func entryCard(_ entry: PlanEntry, in day: PlanDay) -> some View {
        let workout = model.workout(for: entry)
        let card = PlanEntryCard(
            entry: entry,
            workout: workout,
            ftp: ftp,
            isCompleted: day.isCompleted(entry),
            isMissed: day.isPast && !day.isCompleted(entry)
        )
        .frame(width: 240 * Theme.scale)

        #if os(tvOS)
        Button {
            actionEntry = entry
        } label: {
            card
        }
        .buttonStyle(CardButtonStyle())
        .withoutSystemFocusEffect()
        #else
        ZStack(alignment: .topTrailing) {
            Button {
                if let workout { path.append(workout) } else { actionEntry = entry }
            } label: {
                card
            }
            .buttonStyle(CardButtonStyle())
            .contextMenu { entryMenu(entry, workout: workout) }

            Menu {
                entryMenu(entry, workout: workout)
            } label: {
                Image(systemName: "ellipsis.circle")
                    .font(.system(size: 15))
            }
            .menuStyle(.borderlessButton)
            .menuIndicator(.hidden)
            .fixedSize()
            .padding(8)
        }
        #endif
    }

    #if !os(tvOS)
    @ViewBuilder
    private func entryMenu(_ entry: PlanEntry, workout: Workout?) -> some View {
        if let workout {
            Button {
                model.startRide(workout)
            } label: {
                Label("Einheit starten", systemImage: "play.fill")
            }
            .disabled(!model.hasPowerSource)
            Button {
                path.append(workout)
            } label: {
                Label("Programm ansehen", systemImage: "doc.text.magnifyingglass")
            }
        }
        Menu("Auf anderen Tag legen") {
            ForEach(Weekday.allCases.filter { $0 != entry.weekday }) { weekday in
                Button(weekday.name) { model.movePlanEntry(entry, to: weekday) }
            }
        }
        Divider()
        Button(role: .destructive) {
            model.removePlanEntry(entry)
        } label: {
            Label("Aus dem Plan nehmen", systemImage: "minus.circle")
        }
    }
    #endif

    private func addButton(_ day: PlanDay) -> some View {
        Button {
            pickerDay = day.weekday
        } label: {
            VStack(spacing: 6) {
                Image(systemName: "plus")
                    .font(.system(size: 20 * Theme.scale, weight: .semibold))
                Text(day.entries.isEmpty ? "Programm einplanen" : "Noch eins")
                    .font(.system(size: 13 * Theme.scale, weight: .medium))
            }
            .foregroundStyle(.secondary)
            .frame(width: (day.entries.isEmpty ? 200 : 140) * Theme.scale)
            .frame(minHeight: 96 * Theme.scale)
            .overlay {
                RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.14), style: StrokeStyle(lineWidth: 1.5, dash: [6, 5]))
            }
            .contentShape(RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous))
        }
        .buttonStyle(CardButtonStyle())
        .withoutSystemFocusEffect()
        .accessibilityLabel("Programm für \(day.weekday.name) einplanen")
    }
}

/// Ein Eintrag im Plan: Name, Dauer, Belastung, und ob er schon gefahren ist.
struct PlanEntryCard: View {
    let entry: PlanEntry
    let workout: Workout?
    let ftp: Int
    var isCompleted = false
    /// Der Tag ist vorbei und nichts gefahren. Leiser dargestellt, nicht als
    /// Vorwurf - ein Plan ist ein Vorschlag.
    var isMissed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let workout {
                WorkoutProfileChart(workout: workout, ftp: ftp, showsGrid: false)
                    .frame(height: 40 * Theme.scale)
            }

            HStack(spacing: 6) {
                if isCompleted {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Theme.positive)
                }
                Text(workout?.name ?? entry.workoutName)
                    .font(.system(size: 15 * Theme.scale, weight: .semibold))
                    .lineLimit(1)
            }
            // Platz für das Menü oben rechts auf dem Mac.
            .padding(.trailing, 18)

            if let workout {
                HStack(spacing: 10) {
                    Label(Formatting.compactDuration(workout.duration), systemImage: "clock")
                    Label("\(workout.plannedTSS(ftp: ftp)) TSS", systemImage: "flame")
                }
                .font(.system(size: 11 * Theme.scale, weight: .medium))
                .foregroundStyle(.secondary)
            } else {
                Text("Nicht mehr vorhanden")
                    .font(.system(size: 11 * Theme.scale, weight: .medium))
                    .foregroundStyle(Theme.negative)
            }
        }
        .padding(12 * Theme.scale)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardBackground(Theme.surfaceRaised)
        .overlay {
            RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous)
                .strokeBorder(
                    isCompleted ? Theme.positive.opacity(0.6) : Color.white.opacity(0.08),
                    lineWidth: isCompleted ? 1.5 : 1
                )
        }
        .opacity(isMissed ? 0.55 : 1)
    }
}

/// Die Auswahl, welches Programm an einem Tag dran ist.
///
/// Dieselben Kartenreihen wie in der Bibliothek: wer ein Programm dort erkennt,
/// soll es hier wiederfinden, ohne umzulernen.
struct PlanWorkoutPicker: View {
    let model: AppModel
    let weekday: Weekday
    @State private var search = ""
    @Environment(\.dismiss) private var dismiss

    private var rows: [LibraryRow] {
        let query = search.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return model.plannableRows }
        return model.plannableRows.compactMap { row in
            let matches = row.workouts.filter {
                $0.name.localizedCaseInsensitiveContains(query) || $0.tags.contains { $0.localizedCaseInsensitiveContains(query) }
            }
            return matches.isEmpty ? nil : LibraryRow(id: row.id, title: row.title, subtitle: row.subtitle, workouts: matches)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 26 * Theme.scale) {
                    #if os(tvOS)
                    Text("Programm für \(weekday.name)")
                        .font(.system(size: 30 * Theme.scale, weight: .bold, design: .rounded))
                        .padding(.horizontal, Theme.pageInset)
                    #endif

                    if rows.isEmpty {
                        Text("Kein Programm passt zu „\(search)“.")
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, Theme.pageInset)
                    }

                    ForEach(rows) { row in
                        WorkoutRowView(row: row, ftp: model.settings.rider.ftp) { workout in
                            model.planWorkout(workout, on: weekday)
                            dismiss()
                        }
                    }
                }
                .padding(.vertical, Theme.pageInset * 0.6)
            }
            .background(Theme.background)
            #if !os(tvOS)
            .navigationTitle("Programm für \(weekday.name)")
            .searchable(text: $search, prompt: "Programm suchen")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
            }
            #endif
        }
        #if os(macOS)
        .frame(minWidth: 820, minHeight: 600)
        #endif
    }
}

/// „Heute dran“ oben in der Bibliothek - der kürzeste Weg vom Plan aufs Rad.
struct TodayPlanCard: View {
    let model: AppModel
    let onOpen: (Workout) -> Void

    var body: some View {
        let days = model.planWeek()
        if let today = days.first(where: \.isToday), !today.entries.isEmpty {
            card(title: "Heute im Plan", day: today, entries: today.entries)
        } else if let next = days.first(where: { !$0.isPast && !$0.isToday && !$0.openEntries.isEmpty }) {
            card(title: "Heute ist frei. Als Nächstes: \(next.weekday.name)", day: next, entries: next.openEntries)
        }
    }

    private func card(title: String, day: PlanDay, entries: [PlanEntry]) -> some View {
        VStack(alignment: .leading, spacing: 12 * Theme.scale) {
            HStack(spacing: 8) {
                Image(systemName: AppModel.Section.plan.systemImage)
                    .foregroundStyle(Theme.accent)
                Text(title)
                    .font(.system(size: 20 * Theme.scale, weight: .semibold))
            }
            .padding(.horizontal, Theme.pageInset)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 16 * Theme.scale) {
                    ForEach(entries) { entry in
                        if let workout = model.workout(for: entry) {
                            Button {
                                onOpen(workout)
                            } label: {
                                PlanEntryCard(
                                    entry: entry,
                                    workout: workout,
                                    ftp: model.settings.rider.ftp,
                                    isCompleted: day.isCompleted(entry)
                                )
                                .frame(width: 260 * Theme.scale)
                            }
                            .buttonStyle(CardButtonStyle())
                            .withoutSystemFocusEffect()
                        }
                    }
                }
                .padding(.horizontal, Theme.pageInset)
                .padding(.vertical, Theme.focusBleed)
            }
            .padding(.vertical, -Theme.focusBleed)
            .focusGroup()
        }
    }
}

/// „Einplanen“ auf der Seite eines Programms: ein Menü mit den Wochentagen.
///
/// Ein Haken zeigt, wo das Programm schon steht, und ein zweiter Klick nimmt
/// es dort wieder heraus - so lässt sich dasselbe Programm mit ein paar Klicks
/// auf mehrere Tage legen.
struct PlanMenu: View {
    let model: AppModel
    let workout: Workout

    var body: some View {
        let planned = model.planWeekdays(for: workout)
        Menu {
            ForEach(Weekday.allCases) { weekday in
                Button {
                    toggle(weekday)
                } label: {
                    if planned.contains(weekday) {
                        Label(weekday.name, systemImage: "checkmark")
                    } else {
                        Text(weekday.name)
                    }
                }
            }
        } label: {
            Label(
                planned.isEmpty
                    ? "Einplanen"
                    : "Im Plan: " + Array(Set(planned)).sorted().map(\.shortName).joined(separator: ", "),
                systemImage: "calendar.badge.plus"
            )
        }
        .buttonStyle(.bordered)
        #if os(macOS)
        .fixedSize()
        #endif
    }

    private func toggle(_ weekday: Weekday) {
        if let entry = model.plan.entries(on: weekday).first(where: { $0.workoutID == workout.id }) {
            model.removePlanEntry(entry)
        } else {
            model.planWorkout(workout, on: weekday)
        }
    }
}
