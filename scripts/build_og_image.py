# 링크 공유 미리보기 이미지(OG 썸네일)와 파비콘·앱 아이콘 생성
#   사용법: python3 scripts/build_og_image.py   (또는 npm run build:og)
#   필요: Pillow (pip install pillow)
# 입력: public/brand/gnu-logo.png (경상국립대학교 공식 로고, 원형 엠블럼 + 국·영문 워드마크)
# 출력: public/og-image.png (1200×630), src/app/icon.png (512×512), src/app/apple-icon.png (180×180)
# 문구는 src/lib/constants.ts(PROGRAM_NAME·ORGANIZER_NAME)와 맞춘다.
import pathlib

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
LOGO = ROOT / "public" / "brand" / "gnu-logo.png"
FONT_BOLD = ROOT / "public" / "fonts" / "NotoSansKR-Bold-Cert.ttf"
FONT_REGULAR = ROOT / "public" / "fonts" / "NotoSansKR-Regular-Cert.ttf"

BRAND = (0, 56, 118)  # #003876 (tailwind brand)
BRAND_DARK = (0, 34, 74)  # #00224a
ACCENT_SOFT = (186, 214, 245)
WHITE = (255, 255, 255)

SITE_URL = "ai-x-course.vercel.app"
EYEBROW = "경상국립대학교 글로컬대학30 · 2026학년도"
TITLE_LINES = ["AI-X 교과목 개발·인증을 위한", "AI 활용 역량 강화 워크숍"]
SUBTITLE = "2026. 11. 5.(목) ~ 11. 20.(금) · 7개 세션 · 세션별 선착순 신청"
FOOTER = "주관  경상국립대학교 AI융합원"


def font(path: pathlib.Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


def fit_font(draw: ImageDraw.ImageDraw, text: str, path: pathlib.Path, size: int, max_width: int):
    """max_width 안에 들어올 때까지 글자 크기를 줄인다."""
    while size > 12:
        f = font(path, size)
        if draw.textlength(text, font=f) <= max_width:
            return f
        size -= 1
    return font(path, size)


def emblem_box(logo: Image.Image) -> tuple[int, int, int, int]:
    """워드마크 위 원형 엠블럼 영역(첫 번째 완전 투명 행 위쪽)을 찾는다."""
    alpha = logo.split()[3]
    width, height = logo.size
    for y in range(int(height * 0.4), height):
        if all(alpha.getpixel((x, y)) <= 20 for x in range(width)):
            return alpha.crop((0, 0, width, y)).getbbox() or (0, 0, width, y)
    return logo.getbbox() or (0, 0, width, height)


def build_og(logo: Image.Image) -> Image.Image:
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), BRAND)
    draw = ImageDraw.Draw(img)

    # 배경: 하단 띠 + 우측 장식 원
    draw.rectangle((0, H - 92, W, H), fill=BRAND_DARK)
    draw.ellipse((W - 260, -180, W + 160, 240), outline=(30, 90, 160), width=3)

    # 좌측 흰색 패널 + 로고(비율 유지)
    panel = (56, 56, 456, H - 132)
    draw.rounded_rectangle(panel, radius=28, fill=WHITE)
    pw, ph = panel[2] - panel[0] - 64, panel[3] - panel[1] - 56
    scale = min(pw / logo.width, ph / logo.height)
    lw, lh = int(logo.width * scale), int(logo.height * scale)
    resized = logo.resize((lw, lh), Image.LANCZOS)
    lx = panel[0] + (panel[2] - panel[0] - lw) // 2
    ly = panel[1] + (panel[3] - panel[1] - lh) // 2
    img.paste(resized, (lx, ly), resized)

    # 우측 텍스트
    x, max_w = 512, W - 512 - 56
    y = 92
    eyebrow = fit_font(draw, EYEBROW, FONT_REGULAR, 26, max_w)
    draw.text((x, y), EYEBROW, font=eyebrow, fill=ACCENT_SOFT)
    y += 62

    title_size = min(
        fit_font(draw, line, FONT_BOLD, 52, max_w).size for line in TITLE_LINES
    )
    title = font(FONT_BOLD, title_size)
    for line in TITLE_LINES:
        draw.text((x, y), line, font=title, fill=WHITE)
        y += int(title_size * 1.32)

    y += 18
    draw.rounded_rectangle((x, y, x + 64, y + 6), radius=3, fill=(255, 183, 3))  # 포커스 색 포인트
    y += 30
    subtitle = fit_font(draw, SUBTITLE, FONT_REGULAR, 26, max_w)
    draw.text((x, y), SUBTITLE, font=subtitle, fill=ACCENT_SOFT)

    # 하단 띠 텍스트
    footer_font = font(FONT_BOLD, 26)
    url_font = font(FONT_REGULAR, 24)
    fy = H - 92 + (92 - 34) // 2
    draw.text((56, fy), FOOTER, font=footer_font, fill=WHITE)
    url_w = draw.textlength(SITE_URL, font=url_font)
    draw.text((W - 56 - url_w, fy + 2), SITE_URL, font=url_font, fill=ACCENT_SOFT)
    return img


def build_icon(logo: Image.Image, size: int, background: tuple[int, int, int] | None) -> Image.Image:
    emblem = logo.crop(emblem_box(logo))
    side = max(emblem.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(emblem, ((side - emblem.width) // 2, (side - emblem.height) // 2), emblem)
    pad = int(size * 0.04)
    inner = square.resize((size - pad * 2, size - pad * 2), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (*background, 255) if background else (0, 0, 0, 0))
    canvas.paste(inner, (pad, pad), inner)
    return canvas.convert("RGB") if background else canvas


def main() -> None:
    logo = Image.open(LOGO).convert("RGBA")
    outputs = {
        ROOT / "public" / "og-image.png": build_og(logo),
        ROOT / "src" / "app" / "icon.png": build_icon(logo, 512, None),
        ROOT / "src" / "app" / "apple-icon.png": build_icon(logo, 180, WHITE),  # iOS는 투명 배경 미지원
    }
    for path, image in outputs.items():
        image.save(path, optimize=True)
        print(f"{path.relative_to(ROOT)}: {image.size[0]}x{image.size[1]}, {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
