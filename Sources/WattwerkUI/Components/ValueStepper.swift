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

    var body: some View {
        HStack(spacing: 12) {
            Text(label)
                .font(.system(size: 14 * Theme.scale))
                .frame(maxWidth: .infinity, alignment: .leading)

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
}
