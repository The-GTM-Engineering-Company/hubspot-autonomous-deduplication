#!/usr/bin/env python3
"""Create an isolated client worker. Never copy credentials or start CRM writes."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil

parser = argparse.ArgumentParser()
parser.add_argument('--destination', type=Path, required=True)
parser.add_argument('--client', required=True)
parser.add_argument('--portal', required=True)
parser.add_argument('--account-label', required=True)
parser.add_argument('--origin', default='https://app.hubspot.com')
parser.add_argument('--port', type=int, default=9447)
args = parser.parse_args()
if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', args.client) or not re.fullmatch(r'\d+', args.portal):
    parser.error('Use a lowercase client slug and a numeric portal ID.')
if not re.fullmatch(r'https://app(?:-[a-z0-9]+)?\.hubspot\.com', args.origin) or not 1024 <= args.port <= 65535:
    parser.error('Invalid HubSpot origin or local port.')
if args.destination.exists():
    parser.error('Destination already exists; inspect and resume it instead of overwriting checkpoints.')
os.umask(0o077)
source = Path(__file__).resolve().parents[1] / 'assets' / 'worker'
shutil.copytree(source, args.destination, ignore=shutil.ignore_patterns('runtime', 'node_modules', '__pycache__', '*.pyc', 'config.json'))
# Preserve only the synthetic config needed by offline tests.
shutil.copyfile(source / 'test' / 'config.json', args.destination / 'test' / 'config.json')
config = json.loads((source / 'config.example.json').read_text())
config.update(clientSlug=args.client, portalId=args.portal, accountLabel=args.account_label, hubspotOrigin=args.origin, cdpPort=args.port)
(args.destination / 'config.json').write_text(json.dumps(config, indent=2) + '\n')
(args.destination / 'config.json').chmod(0o600)
print(f'Created {args.destination.resolve()}')
print('Next: install dependencies, open login, verify scope and fields, record authorization, and run the pilot. No CRM action was taken.')
