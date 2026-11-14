#!/bin/zsh
cd "${0:A:h}" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null || ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||a===22&&b>=12?0:1)' 2>/dev/null; then
  print 'Install Node.js LTS for macOS from the official page opening now. Then double-click this launcher again.'
  /usr/bin/open 'https://nodejs.org/en/download'
  read '?Press Return to close. '
  exit 1
fi
if [[ ! -d '/Applications/Google Chrome.app' ]]; then
  print 'Install Google Chrome into Applications from the official page opening now. Then double-click this launcher again.'
  /usr/bin/open 'https://www.google.com/chrome/'
  read '?Press Return to close. '
  exit 1
fi
node share-start.mjs
