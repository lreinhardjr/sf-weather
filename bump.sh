#!/bin/sh
# Stamp the stylesheet and script references in index.html so browsers fetch fresh copies
# after every deploy (GitHub Pages caches files for 10 minutes). Run before committing.
STAMP=$(date -u +%Y%m%d%H%M%S)
sed -i '' -E "s#(href=\"styles\.css)(\?v=[0-9]+)?\"#\1?v=$STAMP\"#; s#(src=\"script\.js)(\?v=[0-9]+)?\"#\1?v=$STAMP\"#" index.html
echo "stamped index.html with v=$STAMP"
