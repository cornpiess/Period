# Lightweight iOS candidate

This is a reviewable native Swift/WKWebView replacement for the Expo iOS shell.
It retains bundle ID `com.cornpiess.period`, the existing calendar/algorithms, and
the JSON clipboard backup/restore UI. It is not yet the production build lane.

Run `node ios-lite/generate-project.cjs` to generate the dependency-free Xcode
project and bundled web resources. The verification workflow compiles an
unsigned device Release build, measures both its uncompressed and ZIP sizes,
and runs durable-storage plus WebKit simulator integration checks. These sizes
are estimates, not final App Store download/install measurements. No IPA is
uploaded to TestFlight by the verification workflow.

Records and preferences are atomically saved in
`Library/Application Support/PeriodRecords/records.json` with complete file
protection and one previous verified version. They are eligible for system
backup. Reconstructible web assets in `Documents/period-www` are excluded.
Keeping that legacy file URL and WebKit's default persistent data store enables
an existing Expo localStorage history to be imported before the adapter starts.
Native write failures are propagated synchronously so the shared calendar does
not publish an unsuccessful save. Unreadable history is never silently reset.

## Recovery boundaries

Quick Start migration or restoring a device backup can restore local app data.
Signing into the same Apple account and downloading the app alone does not.
Physical-device migration and backup restoration still require validation.

There is deliberately no CloudKit, iCloud Documents, or HealthKit entitlement
and no automatic health-data upload in this candidate. App Review Guideline
5.1.3(ii) says apps may not store personal health information in iCloud:
https://developer.apple.com/app-store/review/guidelines/#health-and-health-research

Apple has not publicly clarified a private encrypted CloudKit exception here:
https://developer.apple.com/forums/thread/838493

Apple Health is a separate potential route for authorized, accurate observed
menstrual data, with user-controlled iCloud health sync. It must not be used to
write the app's default seven-day display duration as seven confirmed bleeding
days or as a generic storage bucket for arbitrary app state. A HealthKit sample
restore is not equivalent to restoring all app records/settings. A production
account-only recovery design needs this distinction resolved before release.

Before replacing the production lane: validate an update from the existing
signed Expo app, real device-to-device migration, backup restoration, clipboard
restore, and the final signed App Store device-variant sizes.
