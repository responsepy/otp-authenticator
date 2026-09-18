#!/usr/bin/env python3
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
RENDERER = ROOT / "renderer"
SIZE = 1024


def rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def load_font(size):
    for path in (
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/SFNSText.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "C:\\Windows\\Fonts\\arialbd.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = int(size * 0.06)
    radius = int(size * 0.22)
    rounded_rect(draw, (pad, pad, size - pad, size - pad), radius, (11, 99, 255, 255))

    inner = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    idraw = ImageDraw.Draw(inner)
    inset = int(size * 0.14)
    rounded_rect(idraw, (inset, inset, size - inset, size - inset), int(size * 0.16), (24, 34, 48, 255))
    img = Image.alpha_composite(img, inner)
    draw = ImageDraw.Draw(img)

    cx = cy = size / 2
    ring_outer = size * 0.31
    ring_inner = size * 0.245
    bbox = [cx - ring_outer, cy - ring_outer - size * 0.04, cx + ring_outer, cy + ring_outer - size * 0.04]
    draw.ellipse(bbox, outline=(77, 141, 255, 255), width=int(size * 0.038))
    draw.arc(bbox, start=-90, end=150, fill=(255, 255, 255, 255), width=int(size * 0.038))

    hole_r = size * 0.07
    hole = [cx - hole_r, cy - hole_r - size * 0.08, cx + hole_r, cy + hole_r - size * 0.08]
    draw.ellipse(hole, outline=(232, 238, 244, 255), width=int(size * 0.028))
    slot_w = size * 0.045
    slot_h = size * 0.09
    draw.rounded_rectangle(
        (cx - slot_w / 2, cy - size * 0.01, cx + slot_w / 2, cy + slot_h),
        radius=int(size * 0.02),
        fill=(232, 238, 244, 255),
    )

    font = load_font(int(size * 0.16))
    text = "OTP"
    box = draw.textbbox((0, 0), text, font=font)
    tw, th = box[2] - box[0], box[3] - box[1]
    draw.text(((size - tw) / 2, size * 0.72), text, font=font, fill=(247, 249, 251, 255))
    return img


def write_icns(png_path, icns_path):
    iconset = BUILD / "icon.iconset"
    if iconset.exists():
        for child in iconset.iterdir():
            child.unlink()
    else:
        iconset.mkdir(parents=True)

    sizes = {
        "icon_16x16.png": 16,
        "icon_16x16@2x.png": 32,
        "icon_32x32.png": 32,
        "icon_32x32@2x.png": 64,
        "icon_128x128.png": 128,
        "icon_128x128@2x.png": 256,
        "icon_256x256.png": 256,
        "icon_256x256@2x.png": 512,
        "icon_512x512.png": 512,
        "icon_512x512@2x.png": 1024,
    }
    master = Image.open(png_path)
    for name, edge in sizes.items():
        master.resize((edge, edge), Image.Resampling.LANCZOS).save(iconset / name)
    import subprocess

    subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(icns_path)], check=True)


def main():
    BUILD.mkdir(parents=True, exist_ok=True)
    master = draw_icon(SIZE)
    png = BUILD / "icon.png"
    master.save(png)
    ico = BUILD / "icon.ico"
    master.save(ico, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    small = master.resize((128, 128), Image.Resampling.LANCZOS)
    small.save(RENDERER / "icon.png")
    try:
        write_icns(png, BUILD / "icon.icns")
    except Exception as exc:
        print(f"icns skipped: {exc}")
    print(f"wrote {png}")
    print(f"wrote {ico}")


if __name__ == "__main__":
    main()
