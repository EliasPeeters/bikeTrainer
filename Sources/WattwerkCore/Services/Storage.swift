import Foundation

/// Tiny persistence port so the stores can be tested without touching the disk.
///
/// Why key/value and not SwiftData: tvOS has no writable Documents directory.
/// The only persistent storage there is `UserDefaults` (roughly 500 kB) or
/// iCloud KVS, so the storage shape has to survive on a key/value budget.
@MainActor
public protocol KeyValueStorage: AnyObject {
    func data(forKey key: String) -> Data?
    func set(_ data: Data?, forKey key: String)
}

@MainActor
public final class UserDefaultsStorage: KeyValueStorage {
    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public func data(forKey key: String) -> Data? {
        defaults.data(forKey: key)
    }

    public func set(_ data: Data?, forKey key: String) {
        if let data {
            defaults.set(data, forKey: key)
        } else {
            defaults.removeObject(forKey: key)
        }
    }
}

/// One JSON file per key inside Application Support. Used on macOS/iOS where
/// ride history can be megabytes.
@MainActor
public final class FileStorage: KeyValueStorage {
    private let directory: URL

    public init(folderName: String = "Wattwerk") {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        directory = base.appendingPathComponent(folderName, isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    public var directoryURL: URL { directory }

    private func url(for key: String) -> URL {
        directory.appendingPathComponent("\(key).json")
    }

    public func data(forKey key: String) -> Data? {
        try? Data(contentsOf: url(for: key))
    }

    public func set(_ data: Data?, forKey key: String) {
        let target = url(for: key)
        if let data {
            try? data.write(to: target, options: .atomic)
        } else {
            try? FileManager.default.removeItem(at: target)
        }
    }
}

@MainActor
public final class InMemoryStorage: KeyValueStorage {
    private var values: [String: Data] = [:]

    public init() {}

    public func data(forKey key: String) -> Data? { values[key] }

    public func set(_ data: Data?, forKey key: String) {
        values[key] = data
    }
}

public enum StorageFactory {
    /// tvOS gets `UserDefaults` because there is nowhere else to write.
    @MainActor
    public static func makeDefault() -> any KeyValueStorage {
        #if os(tvOS)
        return UserDefaultsStorage()
        #else
        return FileStorage()
        #endif
    }

    /// `false` on tvOS: per-second sample tracks do not fit the key/value budget.
    public static var storesSampleTracks: Bool {
        #if os(tvOS)
        return false
        #else
        return true
        #endif
    }
}
