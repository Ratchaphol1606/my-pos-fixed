#!/usr/bin/env python3
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image, ImageDraw, ImageFont
import struct, logging, os, unicodedata

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)

PRINTER_DEV = '/dev/usb/lp0'
FONT_PATH   = os.environ.get('POS_FONT_PATH', '/home/print/pos-print-server/Garuda.ttf')
W_58MM      = 384  # paper width px for 58mm printers (203 dpi)
W_80MM      = 576  # paper width px for 80mm printers (203 dpi)

# Font sizes in px. These are sized to match the browser-printed receipt
# (about 2.9mm body text), which was the size that read comfortably.
SIZE_SMALL  = 20   # address, phone, secondary info
SIZE_BODY   = 24   # items, totals, details
SIZE_STRONG = 26   # points balance
SIZE_TOTAL  = 30   # grand total
SIZE_TITLE  = 32   # shop name

MARGIN   = 10  # left/right margin in px
LINE_GAP = 6   # extra px between lines

ESC      = b'\x1b'
GS       = b'\x1d'
CMD_INIT = ESC + b'@'
CMD_CUT  = GS  + b'V\x41\x00'


def image_to_escpos(img) -> bytes:
    # Hard threshold (no dithering) keeps text crisp and solid on thermal paper
    img = img.convert('L').point(lambda p: 255 if p > 180 else 0, mode='1')
    width, height = img.size
    padded_width = ((width + 7) // 8) * 8
    if padded_width != width:
        img = img.crop((0, 0, padded_width, height))
    bytes_per_row = padded_width // 8
    # In mode '1', bit 1 = white; ESC/POS wants bit 1 = black, so invert
    raw = bytes(b ^ 0xFF for b in img.tobytes())
    buf = bytearray()
    buf += b'\x1b\x33\x00'
    header = GS + b'v0' + b'\x00' + struct.pack('<H', bytes_per_row) + struct.pack('<H', 1)
    for y in range(height):
        buf += header
        buf += raw[y * bytes_per_row:(y + 1) * bytes_per_row]
    return bytes(buf)


def fmt(val):
    # Whole baht print without decimals; fractional amounts keep up to 2
    # decimals (same as the web receipt) so promo / wholesale lines add up.
    try:
        s = f"{float(val):,.2f}"
    except (TypeError, ValueError):
        return '0'
    return s.rstrip('0').rstrip('.') if '.' in s else s


def load_font(size):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except Exception:
        return ImageFont.load_default()


def text_width(draw, t, font):
    return draw.textlength(t, font=font)


def line_height(font):
    # ~1.4x the font size leaves room for stacked Thai vowels/tone marks
    # without wasting paper (font metrics alone give much looser spacing)
    size = getattr(font, 'size', 20)
    return int(size * 1.4) + LINE_GAP // 2


# Characters that must not start a line (closing punctuation, Thai following
# vowels) or end a line (opening brackets, baht sign, Thai leading vowels).
NO_BREAK_BEFORE = set(')]}:,.;!?%ะาำๆฯ')
NO_BREAK_AFTER  = set('([{฿เแโใไ')


def is_combining(ch):
    # Thai vowels/tone marks that sit above or below a base letter must stay
    # on the same line as the letter before them
    return unicodedata.category(ch) == 'Mn'


def wrap_text(draw, t, font, max_w):
    """Wrap text to max_w px. Breaks at spaces when possible, otherwise
    between characters (Thai has no spaces), never splitting a combining mark."""
    t = str(t)
    if not t:
        return ['']
    lines = []
    for paragraph in t.split('\n'):
        words = paragraph.split(' ')
        cur = ''
        for word in words:
            candidate = word if not cur else cur + ' ' + word
            if text_width(draw, candidate, font) <= max_w:
                cur = candidate
                continue
            if cur:
                lines.append(cur)
                cur = ''
            # Word alone is too wide: break it by characters
            piece = ''
            for ch in word:
                trial = piece + ch
                if (piece and not is_combining(ch)
                        and ch not in NO_BREAK_BEFORE and piece[-1] not in NO_BREAK_AFTER
                        and text_width(draw, trial, font) > max_w):
                    lines.append(piece)
                    piece = ch
                else:
                    piece = trial
            cur = piece
        lines.append(cur)
    return lines


def render_receipt(data: dict) -> Image.Image:
    # Paper width comes from the web app's settings; default stays 58mm
    W = W_80MM if data.get('paperWidthMm') == 80 else W_58MM
    CONTENT_W = W - 2 * MARGIN

    f_small  = load_font(SIZE_SMALL)
    f_body   = load_font(SIZE_BODY)
    f_strong = load_font(SIZE_STRONG)
    f_total  = load_font(SIZE_TOTAL)
    f_title  = load_font(SIZE_TITLE)

    # Entries: ('text', t, font, align, bold) | ('row', left, right, font, bold)
    #          ('divider',) | ('space', px)
    entries = []

    def text(t, font, align='left', bold=False):
        entries.append(('text', t, font, align, bold))

    def row(left, right, font, bold=False):
        entries.append(('row', left, right, font, bold))

    def divider():
        entries.append(('divider',))

    def space(px=8):
        entries.append(('space', px))

    shop_name    = data.get('shopName', 'MY POS')
    shop_address = data.get('shopAddress', '')
    shop_phone   = data.get('shopPhone', '')
    method       = data.get('paymentMethod', 'เงินสด')

    subtotal_val = float(data.get('subtotal', 0))
    discount_val = float(data.get('discount', 0))
    total_val    = float(data.get('total', 0))
    received_val = float(data.get('received', 0))
    change_val   = float(data.get('change', 0))

    # Header
    text(shop_name, f_title, 'center', bold=True)
    if shop_address:
        text(shop_address, f_small, 'center')
    if shop_phone:
        text(f"โทร: {shop_phone}", f_small, 'center')
    space(8)
    divider()
    space(8)

    # Receipt info
    text(f"เลขที่: {data.get('receiptNo', '-')}", f_body)
    text(f"วันที่: {data.get('date', '-')}", f_body)
    space(8)
    divider()
    space(8)

    # Items
    for item in data.get('items', []):
        name     = str(item.get('name', ''))
        price    = float(item.get('price', 0))
        qty      = int(item.get('qty', 1))
        subtotal = price * qty
        text(name, f_body, bold=True)
        row(f"   {fmt(price)} x {qty}", fmt(subtotal), f_body)
        space(6)

    divider()
    space(8)

    # Totals
    row("ยอดรวม:", fmt(subtotal_val), f_body)

    # Promotions and wholesale (ราคาส่ง), one row each like the web receipt.
    # row() wraps a long label by itself; the amount sits on its first line.
    for p in data.get('promos') or []:
        if not isinstance(p, dict):
            continue
        try:
            saving = float(p.get('saving', 0))
        except (TypeError, ValueError):
            continue
        if saving <= 0:
            continue
        row(f"โปร {p.get('name', '')} ({p.get('text', '')}):", f"-{fmt(saving)}", f_small)

    if discount_val > 0:
        row("ส่วนลดรวม:", f"-{fmt(discount_val)}", f_body, bold=True)

    space(4)
    row("สุทธิ:", f"฿{fmt(total_val)}", f_total, bold=True)
    space(4)

    row(f"รับเงิน ({method}):", fmt(received_val), f_body)
    if method == 'เงินสด':
        row("เงินทอน:", fmt(change_val), f_body, bold=True)

    # Membership / loyalty points (only when a member is linked to the sale)
    customer_name = data.get('customerName')
    if customer_name:
        space(8)
        divider()
        space(8)

        row("สมาชิก:", str(customer_name), f_body)
        phone_masked = data.get('customerPhoneMasked')
        if phone_masked:
            row("เบอร์:", str(phone_masked), f_body)

        points_earned   = int(data.get('pointsEarned', 0) or 0)
        points_redeemed = int(data.get('pointsRedeemed', 0) or 0)
        points_balance  = data.get('pointsBalance')

        if points_earned > 0:
            row("แต้มที่ได้รับ:", f"+{points_earned}", f_body)
        if points_redeemed > 0:
            row("แต้มที่ใช้:", f"-{points_redeemed}", f_body)
        if points_balance is not None:
            row("แต้มคงเหลือ:", str(int(points_balance)), f_strong, bold=True)

    space(8)
    divider()
    space(8)

    text(f"ชำระด้วย: {method}", f_small, 'center')
    space(6)
    text("*** ขอบคุณที่ใช้บริการ ***", f_body, 'center')

    # ── Layout pass: draws everything and returns the final y.
    #    Run once on a scratch image to measure, once for real.
    def paint(draw, y):
        for entry in entries:
            kind = entry[0]

            if kind == 'divider':
                draw.line([(MARGIN, y + 4), (W - MARGIN, y + 4)], fill='black', width=2)
                y += 10

            elif kind == 'space':
                y += entry[1]

            elif kind == 'text':
                _, t, font, align, bold = entry
                lh = line_height(font)
                for ln in wrap_text(draw, t, font, CONTENT_W):
                    tw = text_width(draw, ln, font)
                    if align == 'center':
                        x = (W - tw) / 2
                    elif align == 'right':
                        x = W - MARGIN - tw
                    else:
                        x = MARGIN
                    draw.text((x, y), ln, font=font, fill='black')
                    if bold:
                        draw.text((x + 1, y), ln, font=font, fill='black')
                    y += lh

            elif kind == 'row':
                _, left, right, font, bold = entry
                lh = line_height(font)
                right_w = text_width(draw, right, font)
                # Leave room for the right column; wrap the left one if needed
                left_max = max(CONTENT_W - right_w - 12, CONTENT_W // 3)
                left_lines = wrap_text(draw, left, font, left_max)
                xr = W - MARGIN - right_w
                for i, ln in enumerate(left_lines):
                    draw.text((MARGIN, y), ln, font=font, fill='black')
                    if bold:
                        draw.text((MARGIN + 1, y), ln, font=font, fill='black')
                    if i == 0:
                        draw.text((xr, y), right, font=font, fill='black')
                        if bold:
                            draw.text((xr + 1, y), right, font=font, fill='black')
                    y += lh
        return y

    scratch = Image.new('RGB', (W, 10), color='white')
    end_y = paint(ImageDraw.Draw(scratch), 16)

    img = Image.new('RGB', (W, end_y + 30), color='white')
    paint(ImageDraw.Draw(img), 16)
    return img


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})

@app.route('/print', methods=['POST'])
def handle_print():
    data = request.get_json()
    if not data:
        return jsonify({'ok': False, 'error': 'No data'}), 400
    logging.info(f"Printing: {data.get('receiptNo', '?')}")
    try:
        img    = render_receipt(data)
        escpos = CMD_INIT + image_to_escpos(img) + b'\n' * 4 + CMD_CUT
        with open(PRINTER_DEV, 'wb') as p:
            p.write(escpos)
        logging.info("✅ OK")
        return jsonify({'ok': True})
    except Exception as e:
        logging.error(f"❌ {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500

if __name__ == '__main__':
    print("🖨️  POS Print Server on port 3001")
    app.run(host='0.0.0.0', port=3001, debug=False)
