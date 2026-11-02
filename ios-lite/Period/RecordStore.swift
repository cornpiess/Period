import Foundation

struct StoreDocument: Codable {
    var format = 1
    var values: [String: String] = [:]
    var legacyImported = false
}

enum StoreFailure: Error { case invalidData, newerFormat, damagedStore }

final class RecordStore {
    static let periodsKey = "period-tracker-v4"
    static let versionKey = "period-algo-version"
    static let configKey = "period-custom-config"
    static let supportedKeys = [periodsKey, versionKey, configKey]
    let url: URL
    private(set) var document: StoreDocument

    init(url: URL) throws {
        self.url = url
        if FileManager.default.fileExists(atPath: url.path) {
            do { document = try JSONDecoder().decode(StoreDocument.self, from: Data(contentsOf: url)) }
            catch {
                // Never silently replace an unreadable history with an empty database.
                let recovery = url.appendingPathExtension("previous")
                guard let data = try? Data(contentsOf: recovery),
                      let recovered = try? JSONDecoder().decode(StoreDocument.self, from: data)
                else { throw StoreFailure.damagedStore }
                document = recovered
            }
            guard document.format == 1 else { throw StoreFailure.newerFormat }
        } else { document = StoreDocument() }
    }

    var values: [String: String] {
        var result = document.values
        if result[Self.periodsKey] == nil { result[Self.periodsKey] = "[]" }
        // Version-selection migration is local UI bookkeeping, not user data.
        result["period-v13-migrated"] = "1"
        return result
    }

    private func canonical(_ value: Any) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        guard let string = String(data: data, encoding: .utf8) else { throw StoreFailure.invalidData }
        return string
    }

    private func validatedPeriods(_ value: String) throws -> [[String: Any]] {
        guard let bytes = value.data(using: .utf8),
              let periods = try JSONSerialization.jsonObject(with: bytes) as? [[String: Any]],
              periods.count <= 20000 else { throw StoreFailure.invalidData }
        var ids = Set<String>()
        for period in periods {
            guard let id = period["id"] as? String, !id.isEmpty, id.count <= 128,
                  ids.insert(id).inserted,
                  let start = period["startDate"] as? String,
                  let end = period["endDate"] as? String,
                  Self.validDate(start), Self.validDate(end), end >= start
            else { throw StoreFailure.invalidData }
        }
        return periods
    }

    static func validDate(_ value: String) -> Bool {
        let parts = value.split(separator: "-").compactMap { Int($0) }
        guard value.range(of: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$", options: .regularExpression) != nil,
              parts.count == 3 else { return false }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let components = DateComponents(year: parts[0], month: parts[1], day: parts[2])
        guard let date = calendar.date(from: components) else { return false }
        let actual = calendar.dateComponents([.year, .month, .day], from: date)
        return actual.year == parts[0] && actual.month == parts[1] && actual.day == parts[2]
    }

    private func update(_ key: String, _ value: String?, in next: inout StoreDocument) throws {
        guard Self.supportedKeys.contains(key) else { throw StoreFailure.invalidData }
        if key == Self.periodsKey {
            let periods = try validatedPeriods(value ?? "[]")
            next.values[key] = try canonical(periods)
        } else {
            if key == Self.versionKey, let value,
               !["1.0", "1.1", "1.2", "1.3", "custom"].contains(value) { throw StoreFailure.invalidData }
            if key == Self.configKey, let value {
                guard let bytes = value.data(using: .utf8), bytes.count <= 65536,
                      (try? JSONSerialization.jsonObject(with: bytes) as? [String: Any]) != nil
                else { throw StoreFailure.invalidData }
                next.values[key] = try canonical(JSONSerialization.jsonObject(with: bytes))
            } else { next.values[key] = value }
        }
    }

    func write(key: String, value: String?) throws {
        var next = document
        try update(key, value, in: &next)
        try persist(next)
    }

    func importLegacy(_ values: [String: String]) throws {
        guard !document.legacyImported else { return }
        var next = document
        // Never replace a populated native store with a stale WebKit snapshot.
        if next.values.isEmpty {
            for key in Self.supportedKeys {
                if let value = values[key] { try update(key, value, in: &next) }
            }
        }
        next.legacyImported = true
        try persist(next)
    }

    private func persist(_ next: StoreDocument) throws {
        let manager = FileManager.default
        try manager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(next)
        let previous = url.appendingPathExtension("previous")
        #if os(iOS)
        let options: Data.WritingOptions = [.atomic, .completeFileProtection]
        #else
        let options: Data.WritingOptions = [.atomic]
        #endif
        if manager.fileExists(atPath: url.path) {
            // Encode the verified in-memory version; don't copy a damaged primary file.
            try JSONEncoder().encode(document).write(to: previous, options: options)
        }
        try data.write(to: url, options: options)
        document = next
    }
}
