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

# A second, cache-proof entry point: an untouched URL that always redirects to the
# newest build (the ?v= query makes it a new cache key).
mkdir -p teams
cat > teams/index.html <<'HTML'
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="refresh" content="0; url=../team-maker/?v=7">
<title>Teams · 分隊</title>
</head>
<body style="background:#0b0f14;color:#e8eef5;font:16px system-ui;padding:24px">
<p>Loading the newest build… <a style="color:#4ea1ff" href="../team-maker/?v=7">tap here</a></p>
</body>
</html>
HTML
echo '  wrote teams/index.html (fresh, uncached entry point)'

echo "synced $(find . -type f -not -path './.git/*' | wc -l) files:"
find . -type f -not -path './.git/*' | sort
