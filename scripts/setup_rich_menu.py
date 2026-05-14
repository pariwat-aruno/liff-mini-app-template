#!/usr/bin/env python3
"""
setup_rich_menu.py — Generate + upload LINE rich menu

Usage:
    python3 setup_rich_menu.py --token YOUR_CHANNEL_ACCESS_TOKEN --liff-id YOUR_LIFF_ID

Customize SECTIONS below for your project.

Output:
    - rich_menu.png         generated image (2500x1686)
    - prints rich_menu_id   set this as Script Property RICHMENU_PAIRED_ID
"""

import argparse
import json
import sys
import urllib.request

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("ERROR: pillow not installed. Run: pip install pillow")
    sys.exit(1)

# ============================================================
# Customize for your project
# ============================================================

BRAND_NAME = "[BRAND_NAME]"
PRIMARY_COLOR = "#0F6E56"
SECONDARY_COLOR = "#1D9E75"

# 4 buttons across, 1 row tall (2500x843)
# Or 4 buttons across, 2 rows (2500x1686 — change RICH_MENU_SIZE.height)
SECTIONS = [
    {"icon": "🏠", "label": "หน้าหลัก",   "page": "index.html"},
    {"icon": "🔗", "label": "ผูกบัญชี",   "page": "pair.html"},
    {"icon": "🛠",  "label": "แอดมิน",     "page": "admin.html"},
    {"icon": "🆔", "label": "ID ของฉัน",  "page": "myid.html"},
]

RICH_MENU_WIDTH = 2500
RICH_MENU_HEIGHT = 843  # short menu

# ============================================================

def build_rich_menu_object(liff_id):
    """Build the LINE rich menu JSON spec."""
    btn_width = RICH_MENU_WIDTH // len(SECTIONS)
    areas = []
    for i, section in enumerate(SECTIONS):
        areas.append({
            "bounds": {
                "x": i * btn_width,
                "y": 0,
                "width": btn_width,
                "height": RICH_MENU_HEIGHT,
            },
            "action": {
                "type": "uri",
                "uri": f"https://liff.line.me/{liff_id}/{section['page']}",
            },
        })

    return {
        "size": {"width": RICH_MENU_WIDTH, "height": RICH_MENU_HEIGHT},
        "selected": True,
        "name": f"{BRAND_NAME} Menu (paired)",
        "chatBarText": "เมนู",
        "areas": areas,
    }


def draw_rich_menu_image(output_path):
    """Generate the rich menu image (no external assets needed)."""
    img = Image.new("RGB", (RICH_MENU_WIDTH, RICH_MENU_HEIGHT), "#FFFFFF")
    draw = ImageDraw.Draw(img)

    btn_width = RICH_MENU_WIDTH // len(SECTIONS)

    # Try to load a font (fallback to default)
    try:
        font_label = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", 60)
        font_icon = ImageFont.truetype("/System/Library/Fonts/Apple Color Emoji.ttc", 137)
    except Exception:
        font_label = ImageFont.load_default()
        font_icon = ImageFont.load_default()

    for i, section in enumerate(SECTIONS):
        x = i * btn_width
        # Background
        bg_color = PRIMARY_COLOR if i % 2 == 0 else SECONDARY_COLOR
        draw.rectangle([x, 0, x + btn_width, RICH_MENU_HEIGHT], fill=bg_color)

        # Divider
        if i > 0:
            draw.line([(x, 50), (x, RICH_MENU_HEIGHT - 50)], fill="white", width=2)

        # Icon (emoji)
        try:
            draw.text((x + btn_width // 2, 280), section["icon"], font=font_icon,
                      fill="white", anchor="mm", embedded_color=True)
        except Exception:
            pass

        # Label
        draw.text((x + btn_width // 2, 540), section["label"], font=font_label,
                  fill="white", anchor="mm")

    img.save(output_path, "PNG")
    print(f"  Image saved: {output_path}")


def upload_rich_menu(token, menu_object, image_path):
    """Create rich menu via LINE API + upload image."""
    # Step 1: Create
    req = urllib.request.Request(
        "https://api.line.me/v2/bot/richmenu",
        data=json.dumps(menu_object).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    res = urllib.request.urlopen(req).read().decode()
    rich_menu_id = json.loads(res)["richMenuId"]
    print(f"  Created rich menu: {rich_menu_id}")

    # Step 2: Upload image
    with open(image_path, "rb") as f:
        image_data = f.read()
    req = urllib.request.Request(
        f"https://api-data.line.me/v2/bot/richmenu/{rich_menu_id}/content",
        data=image_data,
        headers={
            "Content-Type": "image/png",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    urllib.request.urlopen(req)
    print("  Image uploaded")

    return rich_menu_id


def set_default(token, rich_menu_id):
    """Make the rich menu the default for all users."""
    req = urllib.request.Request(
        f"https://api.line.me/v2/bot/user/all/richmenu/{rich_menu_id}",
        headers={"Authorization": f"Bearer {token}"},
        method="POST",
    )
    urllib.request.urlopen(req)
    print("  Set as default rich menu")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--token", required=True, help="LINE Channel Access Token")
    parser.add_argument("--liff-id", required=True, help="LIFF App ID")
    parser.add_argument("--no-default", action="store_true", help="Don't set as default")
    parser.add_argument("--output", default="rich_menu.png", help="Image output path")
    args = parser.parse_args()

    print("Generating rich menu image...")
    draw_rich_menu_image(args.output)

    print("Uploading to LINE...")
    menu = build_rich_menu_object(args.liff_id)
    rich_menu_id = upload_rich_menu(args.token, menu, args.output)

    if not args.no_default:
        print("Setting as default...")
        set_default(args.token, rich_menu_id)

    print("\n✅ Done!")
    print(f"\nRichMenu ID: {rich_menu_id}")
    print("\nNext: Set Script Property in Apps Script:")
    print(f"  RICHMENU_PAIRED_ID = {rich_menu_id}")


if __name__ == "__main__":
    main()
