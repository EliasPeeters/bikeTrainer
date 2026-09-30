import SwiftUI

/// A number with minus/plus buttons, plus direct text entry where the platform
/// has a keyboard. `Stepper` does not exist on tvOS, so this is the shared
/// replacement.
struct ValueStepper: View {
    let label: String
    @Binding var value: Int
    var range: ClosedRange<Int> = 0...999
    var step: Int = 1
    var unit: String?

    /// Beschriftung links, Knöpfe rechts - oder, wo die Breite dafür nicht
    /// reicht wie auf dem iPhone, die Beschriftung über den Knöpfen.
    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 12) {
                labelText
                    .fixedSize()
                    .frame(maxWidth: .infinity, alignment: .leading)
                controls
            }
            VStack(alignment: .leading, spacing: 6) {
                labelText
                HStack(spacing: 12) {
                    controls
                    Spacer(minLength: 0)
                }
            }
        }
    }

    private var labelText: some View {
        Text(label)
            .font(.system(size: 14 * Theme.scale))
    }

    @ViewBuilder
    private var controls: some View {
        Button {
            value = max(range.lowerBound, value - step)
        } label: {
            Image(systemName: "minus")
        }
        .buttonStyle(.bordered)
        .disabled(value <= range.lowerBound)

        #if os(tvOS)
        Text("\(value)")
            .font(.system(size: 16 * Theme.scale, weight: .semibold))
            .monospacedDigit()
            .frame(width: 90 * Theme.scale)
        #else
        TextField(label, value: $value, format: .number)
            .textFieldStyle(.roundedBorder)
            .multilineTextAlignment(.trailing)
            .monospacedDigit()
            .frame(width: 90)
            .onChange(of: value) { _, newValue in
                value = min(max(newValue, range.lowerBound), range.upperBound)
            }
            .numberKeyboard()
        #endif

        if let unit {
            Text(unit)
                .font(.system(size: 13 * Theme.scale))
                .foregroundStyle(.secondary)
                .frame(width: 50 * Theme.scale, alignment: .leading)
        }

        Button {
            value = min(range.upperBound, value + step)
        } label: {
            Image(systemName: "plus")
        }
        .buttonStyle(.bordered)
        .disabled(value >= range.upperBound)
    }
}
