"""Regenerates the web copies of the logic the phone and the web share.

The M-Pesa import logic is written once, in the phone's lib/, and copied to the web with
only the quotes and the import paths changed, so the two can never drift. Edit the phone
file, then run this from artifacts/mobile-budget:

    python scripts/sync-web-twins.py          # write the web copies
    python scripts/sync-web-twins.py --check  # exit 1 if any is out of date

lib/__tests__/twinFiles.test.ts checks the same thing on every test run.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PHONE = os.path.join(HERE, '..', 'lib')
WEB = os.path.join(HERE, '..', '..', 'family-budget', 'src', 'lib')

# phone file -> (web file, import paths to rename)
TWINS = {
    'mpesaImport.ts': ('mpesa-import.ts', {'./mpesaDebts': './mpesa-debts', './payeeLearning': './payee-learning'}),
    'mpesaDebts.ts': ('mpesa-debts.ts', {'./mpesaImport': './mpesa-import'}),
    'payeeLearning.ts': ('payee-learning.ts', {}),
    'savePosting.ts': ('save-posting.ts', {'./mpesaImport': './mpesa-import'}),
}


def web_copy(text, renames):
    out = text.replace('\r\n', '\n').replace("'", '"')
    for old, new in renames.items():
        out = out.replace(old, new)
    return out


def main():
    check = '--check' in sys.argv
    stale = []
    for phone_name, (web_name, renames) in TWINS.items():
        with open(os.path.join(PHONE, phone_name), encoding='utf8', newline='') as f:
            wanted = web_copy(f.read(), renames)
        path = os.path.join(WEB, web_name)
        current = ''
        if os.path.exists(path):
            with open(path, encoding='utf8', newline='') as f:
                current = f.read().replace('\r\n', '\n')
        if current != wanted:
            stale.append(web_name)
            if not check:
                with open(path, 'w', encoding='utf8', newline='\n') as f:
                    f.write(wanted)
    if stale:
        print(('out of date: ' if check else 'updated: ') + ', '.join(stale))
        if check:
            sys.exit(1)
    else:
        print('web copies are up to date')


main()
