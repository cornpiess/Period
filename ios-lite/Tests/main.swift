import Foundation

func expect(_ value: @autoclosure () -> Bool, _ name: String) {
    guard value() else { fatalError("FAIL: " + name) }
    print("PASS: " + name)
}
let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
defer { try? FileManager.default.removeItem(at: directory) }
let url = directory.appendingPathComponent("records.json")
let original = "[{\"id\":\"legacy\",\"startDate\":\"2026-10-01\",\"endDate\":\"2026-10-07\"}]"
let store = try RecordStore(url: url)
try store.importLegacy([RecordStore.periodsKey: original, RecordStore.versionKey: "1.2"])
expect(store.values[RecordStore.periodsKey]?.contains("legacy") == true, "legacy history imported")
expect(store.values[RecordStore.versionKey] == "1.2", "explicit algorithm choice preserved")
try store.importLegacy([RecordStore.periodsKey: "[]"])
expect(store.values[RecordStore.periodsKey]?.contains("legacy") == true, "migration is idempotent")
let reopened = try RecordStore(url: url)
expect(reopened.values == store.values, "records survive process restart")
let beforeInvalid = store.values
do {
    try store.write(key: RecordStore.periodsKey,
        value: "[{\"id\":\"bad\",\"startDate\":\"2026-02-30\",\"endDate\":\"2026-03-07\"}]")
    fatalError("accepted invalid date")
} catch StoreFailure.invalidData { }
expect(store.values == beforeInvalid, "invalid import cannot replace valid history")
let newPeriod = "[{\"id\":\"new\",\"startDate\":\"2026-10-29\",\"endDate\":\"2026-11-04\"}]"
try store.write(key: RecordStore.periodsKey, value: newPeriod)
try Data("broken-json".utf8).write(to: url)
let recovered = try RecordStore(url: url)
expect(recovered.values[RecordStore.periodsKey]?.contains("legacy") == true, "damaged primary recovers last verified version")
try recovered.write(key: RecordStore.versionKey, value: "1.3")
let recoveryReloaded = try RecordStore(url: url)
expect(recoveryReloaded.values == recovered.values, "recovery can be durably saved")
let badURL = directory.appendingPathComponent("bad.json")
try Data("broken".utf8).write(to: badURL)
do { _ = try RecordStore(url: badURL); fatalError("damaged store was silently cleared") }
catch StoreFailure.damagedStore { print("PASS: unreadable history is never silently cleared") }
let blocker = directory.appendingPathComponent("file-instead-of-directory")
try Data().write(to: blocker)
let failing = try RecordStore(url: blocker.appendingPathComponent("records.json"))
let beforeFailure = failing.values
do { try failing.write(key: RecordStore.periodsKey, value: original); fatalError("expected disk failure") }
catch { expect(failing.values == beforeFailure, "failed disk write does not publish new state") }
try recovered.write(key: RecordStore.periodsKey, value: "[]")
let deletedReloaded = try RecordStore(url: url)
expect(deletedReloaded.values[RecordStore.periodsKey] == "[]", "deletions survive reopening")
print("All native storage checks passed.")
