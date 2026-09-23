#!/bin/sh
# Sync the standalone tool sources into this Pages repo folder, then rebuild
# the single-file team-maker bundle. Safe to re-run any time.
set -e
cd "$(dirname "$0")"

rm -rf random-list team-maker
mkdir -p random-list team-maker

cp ../random-list/index.html random-list/
cp ../team-maker/index.html ../team-maker/solver.js ../team-maker/test-solver.js team-maker/

python3 - <<'PY'
tag = '<script src="solver.js"></script>'
html = open('team-maker/index.html').read()
solver = open('../team-maker/solver.js').read()
assert tag in html, 'inline tag missing in team-maker/index.html'
open('team-maker/standalone.html', 'w').write(html.replace(tag, '<script>\n' + solver + '\n</script>'))
print('  built team-maker/standalone.html')
PY

echo "synced $(find . -type f -not -path './.git/*' | wc -l) files:"
find . -type f -not -path './.git/*' | sort
