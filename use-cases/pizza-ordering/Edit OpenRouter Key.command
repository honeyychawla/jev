#!/bin/zsh
cd "${0:A:h}" || exit 1
chmod 600 'OpenRouter Key.env'
/usr/bin/open -a TextEdit 'OpenRouter Key.env'
