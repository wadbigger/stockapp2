export type UserRole = 'superadmin' | 'admin' | 'vendeur' | 'gestionnaire' | 'comptable';

export interface User {
  id: string;
  email: string;
  login: string;
  name: string;
  role: UserRole;
  active: boolean;
  avatar_url: string;
  created_at: string;
  tenantId?: string;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
}

export interface TenantBranding {
  tenantId: string;
  name: string;
  logo_url: string;
  primary_color: string;
}

export interface Category {
  id: string;
  name: string;
  description: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  categories: Category[];
  purchase_price: string;
  sale_price: string;
  unit: string;
  description: string;
  image_url: string | null;
  alert_threshold: number;
  current_stock: number;
  archived: boolean;
  created_at: string;
}

export type StockMovementType = 'entree' | 'sortie' | 'ajustement' | 'vente';

export interface StockMovement {
  id: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  type: StockMovementType;
  quantity: number;
  reason: string;
  date: string;
  supplier_ref: string | null;
  invoice_id: string | null;
  invoice_number?: string | null;
  created_by: string;
  created_by_name?: string;
}

export type ClientType = 'client' | 'fournisseur';

export interface Client {
  id: string;
  type: ClientType;
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  tax_number: string;
  notes: string;
  created_at: string;
}

export type QuoteStatus = 'brouillon' | 'envoye' | 'accepte' | 'refuse' | 'expire';

export interface QuoteLine {
  id?: string;
  product_id: string | null;
  product_name?: string;
  description: string;
  qty: number;
  unit_price: string;
  discount_pct: string;
  vat_rate: string;
  total_ht: string;
}

export interface Quote {
  id: string;
  number: string;
  client_id: string;
  client_name?: string;
  client_company?: string;
  status: QuoteStatus;
  validity_date: string;
  comment: string;
  subtotal_ht: string;
  total_tva: string;
  total_ttc: string;
  lines: QuoteLine[];
  created_by: string;
  created_at: string;
}

export type InvoiceStatus = 'brouillon' | 'emise' | 'partiellement_payee' | 'payee' | 'annulee';

export interface InvoiceLine {
  id?: string;
  product_id: string | null;
  product_name?: string;
  description: string;
  qty: number;
  unit_price: string;
  discount_pct: string;
  vat_rate: string;
  total_ht: string;
}

export interface Payment {
  id: string;
  invoice_id: string;
  amount: string;
  date: string;
  method: string;
  note: string;
}

export interface Invoice {
  id: string;
  number: string;
  client_id: string;
  client_name?: string;
  client_company?: string;
  quote_id: string | null;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  payment_method: string;
  subtotal_ht: string;
  total_tva: string;
  total_ttc: string;
  amount_paid: string;
  lines: InvoiceLine[];
  payments?: Payment[];
  created_by: string;
  created_at: string;
}

export interface Site {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  active: boolean;
  created_at: string;
}

export interface CompanySettings {
  id?: string;
  name: string;
  logo_url: string;
  address: string;
  siret: string;
  vat_number: string;
  default_vat_rate: string;
  currency: string;
  email: string;
  phone: string;
  website: string;
  legal_mentions: string;
  primary_color?: string;
}

export interface DashboardKPIs {
  ca_mois: number;
  factures_emises: number;
  produits_alerte: number;
  factures_attente: number;
}

export interface SalesData {
  month: string;
  total: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  errors?: Record<string, string[]>;
}
