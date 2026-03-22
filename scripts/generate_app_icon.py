from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageChops


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "src-tauri" / "icons"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def vertical_gradient(size, top, bottom):
    width, height = size
    base = Image.new("RGBA", size)
    draw = ImageDraw.Draw(base)
    for y in range(height):
        t = y / max(height - 1, 1)
        color = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(4))
        draw.line((0, y, width, y), fill=color)
    return base


def radial_glow(size, center, radius, color):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    x, y = center
    bbox = (x - radius, y - radius, x + radius, y + radius)
    draw.ellipse(bbox, fill=color)
    return layer.filter(ImageFilter.GaussianBlur(radius * 0.28))


def rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)
    return mask


def rotated_card(size, angle, fill, outline, shadow, inset=False):
    card = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)
    pad = 30
    draw.rounded_rectangle(
        (pad, pad, size[0] - pad, size[1] - pad),
        radius=80,
        fill=fill,
        outline=outline,
        width=10,
    )
    if inset:
        draw.rounded_rectangle(
            (pad + 30, pad + 30, size[0] - pad - 30, size[1] - pad - 30),
            radius=56,
            outline=(255, 255, 255, 50),
            width=4,
        )

    shadow_layer = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow_layer).rounded_rectangle(
        (pad, pad + 16, size[0] - pad, size[1] - pad + 16),
        radius=80,
        fill=shadow,
    )
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(26))

    combined = Image.alpha_composite(shadow_layer, card)
    return combined.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)


def build_icon():
    scale = 2
    size = 1024 * scale
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    bg = vertical_gradient(
        (size, size),
        (38, 62, 74, 255),
        (11, 26, 33, 255),
    )
    bg = ImageChops.screen(bg, radial_glow((size, size), (size * 0.28, size * 0.24), int(size * 0.34), (94, 202, 185, 130)))
    bg = ImageChops.screen(bg, radial_glow((size, size), (size * 0.78, size * 0.74), int(size * 0.30), (255, 164, 112, 90)))
    bg = ImageChops.screen(bg, radial_glow((size, size), (size * 0.78, size * 0.18), int(size * 0.18), (119, 180, 255, 60)))

    mask = rounded_mask((size, size), int(size * 0.235))
    icon.paste(bg, (0, 0), mask)

    grain = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    gdraw = ImageDraw.Draw(grain)
    step = 34
    for y in range(0, size, step):
        alpha = 9 if (y // step) % 2 == 0 else 5
        gdraw.line((0, y, size, y), fill=(255, 255, 255, alpha), width=2)
    grain.putalpha(mask)
    icon.alpha_composite(grain)

    rim = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    rdraw = ImageDraw.Draw(rim)
    rdraw.rounded_rectangle(
        (24, 24, size - 24, size - 24),
        radius=int(size * 0.225),
        outline=(255, 255, 255, 86),
        width=12,
    )
    rdraw.rounded_rectangle(
        (52, 52, size - 52, size - 52),
        radius=int(size * 0.212),
        outline=(255, 255, 255, 26),
        width=6,
    )
    icon.alpha_composite(rim)

    back = rotated_card(
        (880, 760),
        -10,
        (225, 248, 246, 110),
        (255, 255, 255, 90),
        (5, 12, 18, 90),
        True,
    )
    front = rotated_card(
        (880, 760),
        8,
        (247, 252, 248, 230),
        (255, 255, 255, 220),
        (4, 12, 18, 115),
        True,
    )
    icon.alpha_composite(back, (int(size * 0.18), int(size * 0.26)))
    icon.alpha_composite(front, (int(size * 0.14), int(size * 0.23)))

    art = Image.new("RGBA", (760, 600), (0, 0, 0, 0))
    adraw = ImageDraw.Draw(art)
    adraw.rounded_rectangle((0, 0, 760, 600), radius=72, fill=(226, 244, 238, 255))
    adraw.rectangle((0, 330, 760, 600), fill=(35, 89, 86, 255))
    adraw.polygon([(0, 432), (154, 270), (308, 436)], fill=(84, 148, 139, 255))
    adraw.polygon([(208, 470), (420, 208), (644, 478)], fill=(52, 104, 100, 255))
    adraw.polygon([(478, 420), (614, 292), (760, 432), (760, 600), (478, 600)], fill=(28, 66, 67, 255))
    adraw.ellipse((504, 108, 644, 248), fill=(255, 182, 104, 255))
    adraw.rounded_rectangle((52, 52, 708, 548), radius=54, outline=(255, 255, 255, 90), width=8)
    art = art.rotate(8, resample=Image.Resampling.BICUBIC, expand=True)
    icon.alpha_composite(art, (int(size * 0.22), int(size * 0.29)))

    lens = Image.new("RGBA", (350, 350), (0, 0, 0, 0))
    ldraw = ImageDraw.Draw(lens)
    ldraw.ellipse((0, 0, 350, 350), fill=(19, 37, 44, 215))
    ldraw.ellipse((34, 34, 316, 316), outline=(255, 255, 255, 120), width=10)
    ldraw.ellipse((78, 78, 272, 272), fill=(92, 210, 193, 210))
    ldraw.ellipse((116, 116, 234, 234), fill=(255, 248, 240, 250))
    lens = lens.filter(ImageFilter.GaussianBlur(0.4))

    lens_shadow = Image.new("RGBA", (420, 420), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(lens_shadow)
    sdraw.ellipse((28, 40, 390, 402), fill=(0, 0, 0, 88))
    lens_shadow = lens_shadow.filter(ImageFilter.GaussianBlur(24))
    icon.alpha_composite(lens_shadow, (int(size * 0.60), int(size * 0.54)))
    icon.alpha_composite(lens, (int(size * 0.63), int(size * 0.56)))

    highlight = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    hdraw = ImageDraw.Draw(highlight)
    hdraw.rounded_rectangle(
        (110, 70, size - 110, int(size * 0.47)),
        radius=int(size * 0.18),
        fill=(255, 255, 255, 42),
    )
    highlight = highlight.filter(ImageFilter.GaussianBlur(60))
    icon.alpha_composite(highlight)

    icon.putalpha(mask)
    final = icon.resize((1024, 1024), resample=Image.Resampling.LANCZOS)
    return final


def main():
    icon = build_icon()
    png_path = OUT_DIR / "icon.png"
    ico_path = OUT_DIR / "icon.ico"
    preview_path = OUT_DIR / "icon-mac-preview.png"

    icon.save(png_path)
    icon.save(preview_path)
    icon.save(ico_path, sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
    print(f"Wrote {png_path}")
    print(f"Wrote {ico_path}")


if __name__ == "__main__":
    main()
