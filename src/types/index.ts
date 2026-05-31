export type LocationType = 'eczane' | 'magaza' | 'depo' | 'website'
export type SaleChannel = 'fiziksel' | 'instagram' | 'online'
export type SaleStatus = 'tamamlandi' | 'iptal' | 'iade' | 'veresiye'
export type TransferStatus = 'beklemede' | 'tamamlandi' | 'iptal'
export type CourierStatus = 'hazirlaniyor' | 'kuryede' | 'teslim' | 'iade'
export type LossType = 'kargo_hasari' | 'iade' | 'bozulma' | 'fire' | 'diger'
export type DebtStatus = 'odenmedi' | 'odendi'
export type CustomerType = 'bireysel' | 'kurumsal'

export interface Location {
  id: string
  name: string
  type: LocationType
  address?: string
  created_at: string
}

export interface Product {
  id: string
  name: string
  barcode?: string
  category?: string
  unit: string
  purchase_price: number
  standard_price: number
  min_sale_price: number
  description?: string
  image_url?: string
  is_active: boolean
  created_at: string
}

export interface Inventory {
  id: string
  product_id: string
  location_id: string
  quantity: number
  min_stock_alert: number
  updated_at: string
  product?: Product
  location?: Location
}

export interface StockMovement {
  id: string
  product_id: string
  from_location_id?: string
  to_location_id?: string
  quantity: number
  movement_type: 'satin_alma' | 'transfer' | 'satis' | 'fire' | 'iade'
  reference_id?: string
  notes?: string
  created_by?: string
  created_at: string
  product?: Product
  from_location?: Location
  to_location?: Location
}

export interface Purchase {
  id: string
  product_id: string
  quantity: number
  purchase_price: number
  invoice_no?: string
  purchase_date: string
  notes?: string
  created_at: string
  product?: Product
}

export interface Transfer {
  id: string
  product_id: string
  from_location_id: string
  to_location_id: string
  quantity: number
  transfer_price: number
  status: TransferStatus
  notes?: string
  created_at: string
  product?: Product
  from_location?: Location
  to_location?: Location
}

export interface InternalDebt {
  id: string
  debtor_location_id: string
  creditor_location_id: string
  amount: number
  transfer_id?: string
  status: DebtStatus
  paid_at?: string
  created_at: string
  debtor_location?: Location
  creditor_location?: Location
}

export interface Customer {
  id: string
  name: string
  phone?: string
  email?: string
  address?: string
  customer_type: CustomerType
  notes?: string
  location_id?: string
  referred_by?: string
  created_at: string
}

export interface Sale {
  id: string
  location_id: string
  customer_id?: string
  channel: SaleChannel
  sale_date: string
  total_amount: number
  discount_amount: number
  status: SaleStatus
  notes?: string
  created_at: string
  location?: Location
  customer?: Customer
  sale_items?: SaleItem[]
}

export interface SaleItem {
  id: string
  sale_id: string
  product_id: string
  quantity: number
  sale_price: number
  purchase_price: number
  profit: number
  product?: Product
}

export interface CourierOrder {
  id: string
  sale_id?: string
  location_id: string
  recipient_name: string
  recipient_phone?: string
  address: string
  status: CourierStatus
  tracking_no?: string
  delivery_date?: string
  created_at: string
  location?: Location
  sale?: Sale
}

export interface Loss {
  id: string
  location_id: string
  product_id: string
  quantity: number
  loss_type: LossType
  reference_sale_id?: string
  description?: string
  created_at: string
  location?: Location
  product?: Product
}

export interface Return {
  id: string
  sale_id?: string
  product_id: string
  quantity: number
  return_reason?: string
  condition: 'satilik' | 'fire'
  refund_amount?: number
  processed_at: string
  product?: Product
}
