import json
import pathlib
import subprocess
import time

def run(*args):
    return subprocess.check_output(args, text=True).strip()

devices = json.loads(run('xcrun', 'simctl', 'list', 'devices', 'available', '-j'))['devices']
device = next(d for group in devices.values() for d in group if 'iPhone' in d['name'])
udid = device['udid']
if device['state'] != 'Booted':
    run('xcrun', 'simctl', 'boot', udid)
run('xcrun', 'simctl', 'bootstatus', udid, '-b')
run('xcrun', 'simctl', 'install', udid, 'ios-lite/build/simulator/Build/Products/Debug-iphonesimulator/Period.app')
container = pathlib.Path(run('xcrun', 'simctl', 'get_app_container', udid, 'com.cornpiess.period', 'data'))
result = container / 'Documents/simulator-smoke.json'
reports = []
for relaunch in (False, True):
    result.unlink(missing_ok=True)
    args = ['xcrun', 'simctl', 'launch', '--terminate-running-process', udid, 'com.cornpiess.period', '-period-smoke']
    if relaunch:
        args.append('-period-smoke-relaunch')
    run(*args)
    deadline = time.monotonic() + 60
    while not result.exists():
        if time.monotonic() > deadline:
            raise RuntimeError('WebKit integration did not produce a report')
        time.sleep(0.25)
    report = json.loads(result.read_text())
    print(json.dumps(report))
    assert report.get('ok') and report.get('nativeClipboard') and report.get('clipboardUI'), report
    reports.append(report)
pathlib.Path('ios-lite/build/simulator-smoke.json').write_text(json.dumps(reports, indent=2))
run('xcrun', 'simctl', 'io', udid, 'screenshot', 'ios-lite/build/simulator.png')
