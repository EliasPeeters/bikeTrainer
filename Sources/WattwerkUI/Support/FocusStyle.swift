import SwiftUI

/// Wie sich Karten, Listen und Titel auf dem Apple TV verhalten.
///
/// Auf dem Mac zeigt ein Zeiger auf das, was gemeint ist. Auf dem Apple TV
/// gibt es nur den Fokus, und das System bringt dafür eigene Effekte mit, die
/// zu einer hellen Karte passen - nicht zu unserer dunklen. Darum zeichnen wir
/// den Fokus hier selbst.

/// Eine anklickbare Karte.
///
/// `.plain` wäre naheliegend, bringt auf dem Apple TV aber den System-Effekt
/// mit: die fokussierte Karte wird umgefärbt und mit einem Glanzlicht
/// überzogen. Auf dunklem Grund kippen dabei Schrift und Diagramm ins
/// Unlesbare - genau der Eindruck „die Farben sind verschoben“. Stattdessen:
/// Systemeffekt aus, und Fokus als das zeigen, was er ist - die Karte tritt
/// hervor, bekommt einen Rahmen in der Akzentfarbe und einen Schatten.
public struct CardButtonStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        FocusedCard(configuration: configuration)
    }

    private struct FocusedCard: View {
        let configuration: Configuration
        @Environment(\.isFocused) private var isFocused

        private var shape: RoundedRectangle {
            RoundedRectangle(cornerRadius: Theme.cornerRadius, style: .continuous)
        }

        var body: some View {
            configuration.label
                // Aufhellen statt umfärben: der Inhalt behält seine Farben.
                .overlay { shape.fill(Color.white.opacity(isFocused ? 0.08 : 0)) }
                .overlay { shape.strokeBorder(Theme.accent, lineWidth: isFocused ? 5 : 0) }
                .shadow(color: .black.opacity(isFocused ? 0.6 : 0), radius: 24, y: 14)
                .scaleEffect(configuration.isPressed ? 0.97 : (isFocused ? 1.05 : 1.0))
                .animation(.easeOut(duration: 0.16), value: isFocused)
                .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
        }
    }
}

extension View {
    /// Den System-Fokuseffekt abschalten. Nur auf dem Apple TV gibt es einen.
    @ViewBuilder
    public func withoutSystemFocusEffect() -> some View {
        #if os(tvOS)
        hoverEffectDisabled()
        #else
        self
        #endif
    }

    /// Der Titel eines Bereichs.
    ///
    /// Auf dem Apple TV steht der Bereich bereits in der Leiste ganz oben, und
    /// ein Navigationstitel bliebe dort zusätzlich dauerhaft über dem Inhalt
    /// stehen - der große Schriftzug, der über allem liegt. Also: dort keiner.
    @ViewBuilder
    public func sectionTitle(_ title: String) -> some View {
        #if os(tvOS)
        self
        #else
        navigationTitle(title)
        #endif
    }

    /// Macht eine Listenzeile mit der Fernbedienung erreichbar.
    ///
    /// Auf dem Apple TV scrollt nur, was Fokus bekommen kann. Eine reine
    /// Textliste bliebe sonst bei der ersten Bildschirmhöhe stehen.
    @ViewBuilder
    public func reachableByRemote() -> some View {
        #if os(tvOS)
        modifier(RemoteReachableRow())
        #else
        self
        #endif
    }

    /// Ein hervorgehobener Knopf füllt auf dem Apple TV die Akzentfarbe auch
    /// dann, wenn er gar nicht gedrückt werden kann - nur die Schrift wird
    /// blass. Das liest sich wie ein Knopf, der funktioniert. Also abblenden.
    @ViewBuilder
    public func dimmedWhenUnavailable(_ unavailable: Bool) -> some View {
        #if os(tvOS)
        opacity(unavailable ? 0.4 : 1)
        #else
        self
        #endif
    }

    /// Fasst eine Reihe oder Karte zu einer Fokus-Einheit zusammen.
    ///
    /// Auf dem Apple TV wandert der Fokus nach Geometrie: ein Druck nach unten
    /// sucht nur, was waagerecht überlappt. Sitzt der Knopf einer Karte rechts
    /// und der der nächsten links, führt von einem zum anderen kein Weg - der
    /// untere ist schlicht nicht erreichbar, und weil auf dem Apple TV nur der
    /// Fokus scrollt, kommt er nicht einmal ins Bild. Als Fokus-Einheit nimmt
    /// die Karte den Druck entgegen und reicht ihn an ihren Knopf weiter, egal
    /// wo der steht.
    @ViewBuilder
    public func focusGroup() -> some View {
        #if os(tvOS)
        focusSection()
        #else
        self
        #endif
    }
}

#if os(tvOS)
private struct RemoteReachableRow: ViewModifier {
    @FocusState private var isFocused: Bool

    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 12)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Color.white.opacity(isFocused ? 0.12 : 0))
            )
            .focusable()
            .focused($isFocused)
            .animation(.easeOut(duration: 0.15), value: isFocused)
    }
}
#endif
