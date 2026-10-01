#!/usr/bin/env python3
"""macOS service controls. Starting does not manufacture client authorization."""
import argparse
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import socket
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT / 'runtime'
os.umask(0o077)
RUNTIME.mkdir(mode=0o700, exist_ok=True)
CONFIG = json.loads((ROOT / 'config.json').read_text())
DOMAIN = f'gui/{os.getuid()}'
NODE = shutil.which('node')
if not NODE:
    sys.exit('Install Node.js 22 or newer, then reopen the terminal.')
JOBS = {kind: f"io.gtm-engineering.dedupe-{CONFIG['clientSlug']}-{CONFIG['portalId']}-{kind}" for kind in ['browser', 'worker']}

def service(kind):
    result = subprocess.run(['/bin/launchctl', 'print', f'{DOMAIN}/{JOBS[kind]}'], capture_output=True, text=True)
    return {'loaded': result.returncode == 0, 'running': bool(re.search(r'\bstate = running\b', result.stdout)),
            'pid': (re.search(r'\bpid = (\d+)', result.stdout).group(1) if re.search(r'\bpid = (\d+)', result.stdout) else None)}

def plist(kind):
    args = [NODE, str(ROOT / 'browser-host.mjs')] if kind == 'browser' else ['/usr/bin/caffeinate', '-i', '-s', NODE, str(ROOT / 'supervisor.mjs')]
    return {'Label': JOBS[kind], 'ProgramArguments': args, 'WorkingDirectory': str(ROOT),
            'RunAtLoad': True, 'KeepAlive': {'SuccessfulExit': False}, 'ThrottleInterval': 30,
            'StandardOutPath': str(RUNTIME / f'{kind}.log'), 'StandardErrorPath': str(RUNTIME / f'{kind}-error.log'),
            'ProcessType': 'Interactive', 'LimitLoadToSessionType': 'Aqua'}

def start(kind):
    current = service(kind)
    if current['running']:
        return
    if kind == 'browser':
        with socket.socket() as check:
            if check.connect_ex(('127.0.0.1', CONFIG['cdpPort'])) == 0:
                sys.exit('CDP port is occupied by an unverified process. Choose a unique port; do not attach to it.')
    target = RUNTIME / f'{kind}.plist'
    target.write_bytes(plistlib.dumps(plist(kind)))
    target.chmod(0o600)
    if not current['loaded']:
        subprocess.run(['/bin/launchctl', 'bootstrap', DOMAIN, str(target)], check=True)
    else:
        subprocess.run(['/bin/launchctl', 'kickstart', f'{DOMAIN}/{JOBS[kind]}'], check=True)

def stop(kind):
    if service(kind)['loaded']:
        subprocess.run(['/bin/launchctl', 'bootout', f'{DOMAIN}/{JOBS[kind]}'], check=True)

def authorized(pilot=False):
    auth = CONFIG.get('authorization', {})
    if not auth.get('reference') or auth.get('merge') is not True or auth.get('reject') is not True:
        sys.exit('Record the existing client-specific merge/reject authorization in config.json.')
    if not CONFIG.get('scopeVerified'):
        sys.exit('Verify the default rule and queue filters first.')
    if not pilot and not CONFIG.get('validated'):
        sys.exit('Inspect a live pilot before enabling unattended mode.')

parser = argparse.ArgumentParser()
parser.add_argument('action', choices=['login', 'pilot', 'start', 'resume', 'pause', 'stop', 'status'])
parser.add_argument('--pairs', type=int, default=5)
parser.add_argument('--object', choices=['companies', 'contacts'], default='companies')
args = parser.parse_args()
if sys.platform != 'darwin':
    sys.exit('The supplied supervisor is for macOS. Port service management for another OS before running.')

if args.action == 'login':
    (RUNTIME / 'BROWSER_STOP').unlink(missing_ok=True)
    start('browser')
    print('Dedicated Chrome opened. Log in directly, complete MFA, and verify the client account.')
elif args.action in ['start', 'resume', 'pilot']:
    authorized(pilot=args.action == 'pilot')
    if args.action == 'pilot' and not 1 <= args.pairs <= 10:
        sys.exit('Pilot size must be 1–10 pairs.')
    if args.action != 'resume' and any((RUNTIME / f).exists() for f in ['TERMINAL.json', 'DONE']):
        sys.exit('Previous pass ended. Inspect the report; use resume to recheck exceptions/new duplicates.')
    if args.action in ['resume', 'pilot'] and service('worker')['running']:
        sys.exit('Pause the existing worker before running a pilot or resume.')
    if args.action == 'resume':
        for name in ['TERMINAL.json', 'DONE']:
            (RUNTIME / name).unlink(missing_ok=True)
        checkpoint = RUNTIME / 'checkpoint.json'
        if checkpoint.exists():
            data = json.loads(checkpoint.read_text())
            data.update(phase='companies', passAssessment={}, phaseResults={}, status='resuming')
            data['pass'] = None
            for entry in data.get('exceptions', {}).values():
                # A new pass rechecks documented campaign blocks; unknown writes remain quarantined.
                entry.pop('knownBlock', None)
            temporary = checkpoint.with_suffix('.tmp')
            temporary.write_text(json.dumps(data, indent=2) + '\n')
            temporary.replace(checkpoint)
    if args.action == 'start':
        checkpoint = RUNTIME / 'checkpoint.json'
        if checkpoint.exists():
            data = json.loads(checkpoint.read_text())
            if data.get('status') == 'pilot_ready_for_inspection':
                data.update(phase='companies', phaseResults={}, passAssessment={})
                data['pass'] = None
                temporary = checkpoint.with_suffix('.tmp')
                temporary.write_text(json.dumps(data, indent=2) + '\n')
                temporary.replace(checkpoint)
    for name in ['STOP', 'BROWSER_STOP']:
        (RUNTIME / name).unlink(missing_ok=True)
    start('browser')
    if args.action == 'pilot':
        subprocess.run([NODE, str(ROOT / 'worker.mjs'), f'--pilot={args.pairs}', f'--object={args.object}'], cwd=ROOT, check=True)
    else:
        start('worker')
    print('Status and exceptions are in runtime/review-results.md; use status for live process health.')
elif args.action in ['pause', 'stop']:
    (RUNTIME / 'STOP').write_text('Operator stop requested\n')
    stop('worker')
    if args.action == 'stop':
        (RUNTIME / 'BROWSER_STOP').write_text('Operator browser stop requested\n')
        stop('browser')
    print('Stopped. Checkpoints and authentication profile retained.')
else:
    report = RUNTIME / 'review-results.md'
    print(report.read_text() if report.exists() else 'No worker report yet.')
    terminal = RUNTIME / 'TERMINAL.json'
    if terminal.exists():
        print('Terminal state:', terminal.read_text())
    print('Process state:', json.dumps({kind: service(kind) for kind in JOBS}, indent=2))
    heartbeat = RUNTIME / 'worker-heartbeat.json'
    if heartbeat.exists():
        print('Last heartbeat:', heartbeat.read_text())
