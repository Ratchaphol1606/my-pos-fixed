export interface Product {
  id: string;
  name: string;
  category: string;
  cost_price: number;
  retail_price: number;
  stock: number;
  date_add: string;
  is_active: boolean;
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
  customer_id?: string | null;
  points_earned?: number;
  points_redeemed?: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  note?: string | null;
  total_spent: number;
  current_points: number;
  created_at: string;
}

export interface PointTransaction {
  id: string;
  customer_id: string;
  sale_id: string | null;
  type: 'earn' | 'redeem';
  points_change: number;
  created_at: string;
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
  customerName?: string;
  customerPhoneMasked?: string;
  pointsEarned?: number;
  pointsRedeemed?: number;
  pointsBalance?: number;
}

export interface Settings {
  shop_name: string;
  shop_address: string;
  shop_phone: string;
  promptpay_id: string;
  qr_code_url: string | null;
  low_stock_threshold: number;
  earn_amount_thb: number;
  redeem_point_use: number;
  redeem_discount_thb: number;
}