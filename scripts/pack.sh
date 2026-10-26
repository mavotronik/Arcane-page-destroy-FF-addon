#!/bin/bash
# Собирает неподписанный XPI. Постоянная установка из файла работает
# в Firefox ESR, Developer Edition и Nightly при выключенной проверке подписи.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

version="$(python3 -c 'import json; print(json.load(open("manifest.json"))["version"])')"
out="dist/arcane-page-destroy-${version}.xpi"

mkdir -p dist
rm -f "$out"

zip -r -q "$out" \
  manifest.json \
  src \
  arcane_ultimate_2_arcane-only.mp4

echo "Собрано: $root/$out"
echo
echo "Установка (не релизный Firefox):"
echo "1. Запустите Firefox ESR, Developer Edition или Nightly."
echo "2. В about:config выставьте xpinstall.signatures.required = false и оставьте так."
echo "   Подпись проверяется при каждом запуске."
echo "3. В about:addons откройте меню шестерёнки, выберите «Установить дополнение из файла»"
echo "   и укажите этот .xpi."
echo
echo "Дополнение останется после перезапуска. После правок соберите XPI снова и установите файл заново."
