import SwiftUI

/// One number with a label. The ride screen is mostly made of these.
public struct MetricTile: View {
    public enum Size {
        case hero
        case large
        case regular

        var valueSize: CGFloat {
            switch self {
            case .hero: return 120
            case .large: return 56
            case .regular: return 34
            }
        }

        var labelSize: CGFloat {
            switch self {
            case .hero: return 20
            case .large: return 15
            case .regular: return 13
            }
        }
    }

    let label: String
    let value: String
    let unit: String?
    var size: Size = .regular
    var tint: Color = .white
    var secondary: String?

    public init(
        label: String,
        value: String,
        unit: String? = nil,
        size: Size = .regular,
        tint: Color = .white,
        secondary: String? = nil
    ) {
        self.label = label
        self.value = value
        self.unit = unit
        self.size = size
        self.tint = tint
        self.secondary = secondary
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: size == .hero ? 4 : 2) {
            Text(label.uppercased())
                .font(.system(size: size.labelSize * Theme.scale, weight: .semibold))
                .tracking(1.2)
                .foregroundStyle(.secondary)

            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(value)
                    .font(.system(size: size.valueSize * Theme.scale, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(tint)
                    .contentTransition(.numericText())
                if let unit {
                    Text(unit)
                        .font(.system(size: size.labelSize * Theme.scale * 1.1, weight: .medium))
                        .foregroundStyle(.secondary)
                }
            }
            .lineLimit(1)
            .minimumScaleFactor(0.5)

            if let secondary {
                Text(secondary)
                    .font(.system(size: size.labelSize * Theme.scale * 0.95))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
