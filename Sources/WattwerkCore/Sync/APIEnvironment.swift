import Foundation

/// Wohin die App synchronisiert.
///
/// Der eine Ort, an dem die Serveradresse steht. In Entwicklungsbauten zeigt
/// sie auf den lokalen Stack, sonst auf die Adresse, unter der die API
/// tatsächlich läuft - die hier einzutragen ist der einzige Schritt vor dem
/// ersten echten Auslieferbau.
public enum APIEnvironment {
    public static var defaultBaseURL: String {
        #if DEBUG
        // Der lokale Stack aus docker-compose.yml.
        return "http://localhost:8088"
        #else
        return "https://api.wattwerk.eliaspeeters.de"
        #endif
    }

    /// Nur in Entwicklungsbauten lässt sich die Adresse in der App umstellen.
    /// In einer ausgelieferten App wäre ein Feld dafür kein Werkzeug, sondern
    /// eine Möglichkeit, die App kaputtzukonfigurieren.
    public static var isOverridable: Bool {
        #if DEBUG
        return true
        #else
        return false
        #endif
    }

    public static func url(from string: String) -> URL {
        URL(string: string.trimmingCharacters(in: .whitespaces))
            ?? URL(string: defaultBaseURL)!
    }
}
