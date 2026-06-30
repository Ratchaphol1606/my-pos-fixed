#!/usr/bin/env python3
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image, ImageDraw, ImageFont
import struct, logging, os

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)

PRINTER_DEV = '/dev/usb/lp0'
FONT_PATH   = '/home/print/pos-print-server/Garuda.ttf'
W           = 384  # paper width px

ESC      = b'\x1b'
GS       = b'\x1d'
CMD_INIT = ESC + b'@'
CMD_CUT  = GS  + b'V\x41\x00'

def image_to_escpos(img) -> bytes:
    img = img.convert('1')
    width, height = img.size
    padded_width = ((width + 7) // 8) * 8
    img = img.crop((0, 0, padded_width, height))
    buf = bytearray()
    bytes_per_row = padded_width // 8
    buf += b'\x1b\x33\x00'
    for y in range(height):
        row_bytes = bytearray(bytes_per_row)
        for x in range(padded_width):
            if img.getpixel((x, y)) == 0:
                row_bytes[x // 8] |= (0x80 >> (x % 8))
        buf += GS + b'v0' + b'\x00'
        buf += struct.pack('<H', bytes_per_row)
        buf += struct.pack('<H', 1)
        buf += bytes(row_bytes)
    return bytes(buf)

def fmt(val):
    try: return f"{float(val):,.0f}"
    except: return '0'

def render_receipt(data: dict) -> Image.Image:
    try:
        f16 = ImageFont.truetype(FONT_PATH, 16)
        f18 = ImageFont.truetype(FONT_PATH, 18)
        f20 = ImageFont.truetype(FONT_PATH, 20)
        f22 = ImageFont.truetype(FONT_PATH, 22)
        f24 = ImageFont.truetype(FONT_PATH, 24)
    except:
        f16 = f18 = f20 = f22 = f24 = ImageFont.load_default()

    # Each entry: (type, data)
    # types: 'text', 'row', 'divider', 'space'
    entries = []

    def text(t, font, align='left', bold=False):
        entries.append(('text', t, font, align, bold))

    def row(left, right, font, bold=False):
        entries.append(('row', left, right, font, bold))

    def divider():
        entries.append(('divider',))

    def space(px=6):
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
    text(shop_name, f22, 'center', bold=True)
    if shop_address:
        text(shop_address, f16, 'center')
    if shop_phone:
        text(f"โทร: {shop_phone}", f16, 'center')
    space(4)
    divider()
    space(4)

    # Receipt info
    text(f"เลขที่: {data.get('receiptNo', '-')}", f18)
    text(f"วันที่: {data.get('date', '-')}", f18)
    space(4)
    divider()
    space(4)

    # Items
    for item in data.get('items', []):
        name     = str(item.get('name', ''))
        price    = float(item.get('price', 0))
        qty      = int(item.get('qty', 1))
        subtotal = price * qty
        text(name, f18)
        row(f"  {fmt(price)} x {qty}", fmt(subtotal), f18)
        space(2)

    divider()
    space(4)

    # Totals
    row("ยอดรวม:", fmt(subtotal_val), f18)
    if discount_val > 0:
        row("ส่วนลด:", f"-{fmt(discount_val)}", f18)

    space(2)
    row("สุทธิ:", f"฿{fmt(total_val)}", f22, bold=True)
    space(2)

    row(f"รับเงิน ({method}):", fmt(received_val), f18)
    if method == 'เงินสด':
        row("เงินทอน:", fmt(change_val), f18)

    space(4)
    divider()
    space(4)

    text(f"ชำระด้วย: {method}", f18, 'center')
    space(4)
    text("*** ขอบคุณที่ใช้บริการ ***", f18, 'center')

    # ── Measure total height ─────────────────────────────────
    tmp_img  = Image.new('RGB', (W, 10))
    tmp_draw = ImageDraw.Draw(tmp_img)

    total_h = 20
    for entry in entries:
        if entry[0] == 'divider':
            total_h += 10
        elif entry[0] == 'space':
            total_h += entry[1]
        elif entry[0] == 'text':
            _, t, font, _, _ = entry
            bb = tmp_draw.textbbox((0,0), t, font=font)
            total_h += (bb[3] - bb[1]) + 6
        elif entry[0] == 'row':
            _, l, r, font, _ = entry
            bb = tmp_draw.textbbox((0,0), l, font=font)
            total_h += (bb[3] - bb[1]) + 6
    total_h += 30

    # ── Draw ─────────────────────────────────────────────────
    img  = Image.new('RGB', (W, total_h), color='white')
    draw = ImageDraw.Draw(img)
    y    = 16

    for entry in entries:
        if entry[0] == 'divider':
            draw.line([(8, y+4), (W-8, y+4)], fill='black', width=1)
            y += 10

        elif entry[0] == 'space':
            y += entry[1]

        elif entry[0] == 'text':
            _, t, font, align, bold = entry
            bb = draw.textbbox((0,0), t, font=font)
            tw = bb[2] - bb[0]
            th = bb[3] - bb[1]
            x = (W - tw) // 2 if align == 'center' else (W - tw - 8 if align == 'right' else 8)
            draw.text((x, y), t, font=font, fill='black')
            if bold:
                draw.text((x+1, y), t, font=font, fill='black')
            y += th + 6

        elif entry[0] == 'row':
            _, left, right, font, bold = entry
            bbl = draw.textbbox((0,0), left,  font=font)
            bbr = draw.textbbox((0,0), right, font=font)
            th  = bbl[3] - bbl[1]
            xr  = W - (bbr[2] - bbr[0]) - 8
            draw.text((8, y),  left,  font=font, fill='black')
            draw.text((xr, y), right, font=font, fill='black')
            if bold:
                draw.text((9, y),    left,  font=font, fill='black')
                draw.text((xr+1, y), right, font=font, fill='black')
            y += th + 6

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
