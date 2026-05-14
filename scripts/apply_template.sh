#!/bin/bash
# apply_template.sh — Helper script to customize this template for a new project
#
# Usage:
#   ./scripts/apply_template.sh "My Brand" "Tagline here"

set -e

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 \"<brand_name>\" [\"<tagline>\"]"
    echo ""
    echo "Example:"
    echo "  $0 \"Acme Corp\" \"จัดการทีมง่ายๆ ผ่าน LINE\""
    exit 1
fi

BRAND_NAME="$1"
TAGLINE="${2:-LINE mini-app}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Applying template..."
echo "  BRAND_NAME = $BRAND_NAME"
echo "  TAGLINE = $TAGLINE"
echo ""

# Determine sed in-place flag (different on macOS vs Linux)
if [[ "$OSTYPE" == "darwin"* ]]; then
    SED_INPLACE=(-i '')
else
    SED_INPLACE=(-i)
fi

# Find/replace in all relevant files
find "$ROOT_DIR" \
    -type f \
    \( -name "*.html" -o -name "*.md" -o -name "*.gs" -o -name "*.js" -o -name "*.css" -o -name "*.py" \) \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -exec sed "${SED_INPLACE[@]}" "s|\[BRAND_NAME\]|${BRAND_NAME}|g" {} \;

find "$ROOT_DIR" \
    -type f \
    \( -name "*.html" -o -name "*.md" -o -name "*.gs" -o -name "*.js" -o -name "*.css" -o -name "*.py" \) \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -exec sed "${SED_INPLACE[@]}" "s|\[TAGLINE\]|${TAGLINE}|g" {} \;

echo "✅ Template applied"
echo ""
echo "Next steps:"
echo "  1. Edit apps-script/Setup.gs::setupProperties with your LINE credentials"
echo "  2. Read docs/SETUP_GUIDE.md and follow Step 5 onwards"
