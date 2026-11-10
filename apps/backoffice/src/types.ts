// Response shapes from docs/05-api-spec.md. Money fields are "x.yy" strings.

export type Role = 'CASHIER' | 'MANAGER' | 'ADMIN';
export const RANK: Record<Role, number> = { CASHIER: 0, MANAGER: 1, ADMIN: 2 };

export interface Me {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Page<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

export interface Settings {
  shopName: string;
  address: string;
  phone: string;
  taxId: string;
  currency: string;
  timezone: string;
  receiptFooter: string;
}

export interface Category {
  id: string;
  name: string;
  productCount: number;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  categoryId: string | null;
  price: string;
  cost: string;
  taxRate: string;
  stockQty: number;
  reorderLevel: number;
  active: boolean;
}

export type Reason = 'SALE' | 'RECEIVE' | 'ADJUST' | 'RETURN';

export interface Movement {
  id: string;
  productId: string;
  productName: string;
  qtyChange: number;
  reason: Reason;
  saleId: string | null;
  receiptNo: string | null;
  userName: string;
  note: string | null;
  createdAt: string;
}

export interface SaleSummary {
  id: string;
  receiptNo: string;
  createdAt: string;
  cashierName: string;
  customerName: string | null;
  total: string;
  status: 'COMPLETED' | 'VOIDED';
  paymentMethods: string[];
}

export interface Sale {
  id: string;
  receiptNo: string;
  deviceCode: string;
  createdAt: string;
  syncedAt: string;
  status: 'COMPLETED' | 'VOIDED';
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  cashier: { id: string; name: string };
  syncedBy: { id: string; name: string };
  customer: { id: string; name: string } | null;
  voidedBy: { id: string; name: string } | null;
  voidedAt: string | null;
  voidReason: string | null;
  items: { id: string; nameSnapshot: string; unitPrice: string; qty: number; discount: string; lineTotal: string }[];
  payments: { id: string; method: string; amount: string; tendered: string | null; change: string | null }[];
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  salesCount: number;
  totalSpent: string;
}

export interface CustomerDetail extends Omit<Customer, 'salesCount' | 'totalSpent'> {
  stats: { salesCount: number; totalSpent: string; lastSaleAt: string | null };
  recentSales: SaleSummary[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  hasPin: boolean;
  lockedUntil: string | null;
}
