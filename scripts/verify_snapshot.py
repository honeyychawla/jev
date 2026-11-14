#!/usr/bin/env python3
"""Verify the exact imported packages and scan the public snapshot for secrets."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'SOURCE_MANIFEST.json').read_text())
fixtures = json.loads((ROOT / 'scripts/synthetic-key-hashes.json').read_text())
failures = []
count = 0
def sha(data):
    return hashlib.sha256(data).hexdigest()

patterns = {
    'OpenRouter key': rb'sk-or-v1-[A-Za-z0-9_-]{20,}',
    'OpenAI project key': rb'sk-proj-[A-Za-z0-9_-]{20,}',
    'GitHub token': rb'gh[opusr]_[A-Za-z0-9_]{20,}',
    'Google client secret': rb'GOCSPX-[A-Za-z0-9_-]{12,}',
    'Google access token': rb'ya29\.[A-Za-z0-9_.-]{20,}',
    'Google API key': rb'AIza[A-Za-z0-9_-]{30,}',
    'private key': rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
}
def scan(name, data):
    for label, pattern in patterns.items():
        for token in re.findall(pattern, data):
            # Exact, reviewed mock keys in the original tests only.
            if label == 'OpenRouter key' and sha(token) in fixtures.get(name, []):
                continue
            failures.append(f'{name}: possible {label}; value omitted')

assert len(manifest['demos']) == 5
for demo in manifest['demos']:
    archive = ROOT / demo['source_archive']
    if not archive.is_file() or sha(archive.read_bytes()) != demo['archive_sha256']:
        failures.append(f"{demo['use_case']}: original ZIP checksum mismatch")
        continue
    with zipfile.ZipFile(archive) as z:
        if z.testzip() is not None:
            failures.append(f"{demo['use_case']}: ZIP integrity failure")
        members = [n for n in z.namelist() if not n.endswith('/')]
        prefix = members[0].split('/')[0] + '/'
        if set(n[len(prefix):] for n in members) != set(f['path'] for f in demo['files']):
            failures.append(f"{demo['use_case']}: archive file inventory mismatch")
        for file in demo['files']:
            name = f"use-cases/{demo['use_case']}/{file['path']}"
            path = ROOT / name
            data = z.read(prefix + file['path'])
            if sha(data) != file['sha256']:
                failures.append(f'{name}: source archive checksum mismatch')
            if not path.is_file() or sha(path.read_bytes()) != file.get('repository_sha256', file['sha256']):
                failures.append(f'{name}: extracted source checksum mismatch')
            scan(name, data)
            if file['path'].endswith(('.command', '.sh')):
                archive_exec = bool((z.getinfo(prefix + file['path']).external_attr >> 16) & 0o111)
                if archive_exec and not path.stat().st_mode & 0o111:
                    failures.append(f'{name}: executable launcher bit missing')
            count += 1

ignored = {'.git', 'node_modules', '__pycache__', '.qa', 'test-results', 'playwright-report'}
for path in ROOT.rglob('*'):
    relative = path.relative_to(ROOT)
    if any(p in ignored for p in relative.parts) or not path.is_file():
        continue
    if path.is_symlink():
        failures.append(f'{relative}: unexpected symlink')
    if 'data' in relative.parts or path.suffix in {'.db', '.sqlite', '.pem', '.key', '.log', '.pid'}:
        failures.append(f'{relative}: private runtime file must not be shared')
    if path.name.startswith('.env') and path.name != '.env.example':
        failures.append(f'{relative}: environment file must not be shared')
    if path.suffix != '.zip':
        scan(str(relative), path.read_bytes())

key_file = ROOT / 'use-cases/pizza-ordering/OpenRouter Key.env'
if not key_file.read_text().rstrip().endswith('OPENROUTER_API_KEY='):
    failures.append('Pizza key template is not blank')

prompt_files = list((ROOT / 'use-cases').glob('*/ONE_SHOT_BUILD_PROMPT.md'))
if len(prompt_files) != 5:
    failures.append('Expected one build prompt for each of the five demos')
for path in prompt_files:
    text = path.read_text()
    if text.count('```text') != 1 or text.count('```') != 2:
        failures.append(f'{path.parent.name}: expected one copyable natural-language prompt')
if (ROOT / 'chats').exists():
    failures.append('Conversation transcripts must not be included')

if failures:
    raise SystemExit('\n'.join(sorted(set(failures))))
print(f'PASS: {len(manifest["demos"])} original ZIPs, {count} imported files (one documented Git metadata adjustment), 5 one-shot build prompts; no conversation transcripts; credential-pattern scan passed.')
