export interface Product {
  id: string;
  name: string;
  category: string;
  cost_price: number;
  retail_price: number;
  stock: number;
  date_add: string;
}

export interface CartItem extends Product {
  qty: number;
}

export interface Sale {
  id: string;
  receipt_no: string;
  total_amount: number;
  received_amount: number;
  change_amount: number;
  discount_amount: number;
  payment_method: string;
  created_at: string;
  receipt_snapshot?: ReceiptDetail;
}

export interface ReceiptItem {
  name: string;
  price: number;
  qty: number;
  subtotal: number;
}

export interface ReceiptDetail {
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  total: number;
  received: number;
  change: number;
  paymentMethod: string;
  date: string;
  receiptNo: string;
}

export interface Settings {
  shop_name: string;
  shop_address: string;
  shop_phone: string;
  promptpay_id: string;
  qr_code_url: string | null;
  low_stock_threshold: number;
}
