export type SummaryReport = {
  sales_count: number;
  gross: number;
  discounts: number;
  tax: number;
  sales_total: number;
  tips: number;
  refund_count: number;
  refunds_total: number;
  refund_tax: number;
  net_sales: number;
  net_tax: number;
  average_sale: number;
  void_count: number;
  void_total: number;
  methods: { cash: number; card: number; other: number };
};

export type TrendPoint = { bucket: string; sales_count: number; sales_total: number; refunds_total: number; net_sales: number };

export type ProductReportRow = {
  variant_id: string | null;
  name: string;
  category: string | null;
  units_sold: number;
  units_refunded: number;
  net_units: number;
  revenue: number;
  refunded: number;
  net_revenue: number;
};

export type StaffReportRow = {
  staff_id: string;
  name: string;
  sales_count: number;
  sales_total: number;
  refund_count: number;
  refunds_total: number;
  void_count: number;
  void_total: number;
  cash_void_count: number;
  discounts: number;
  tips: number;
};

export type CashupRow = {
  session_id: string;
  register: string;
  opened_at: string;
  closed_at: string;
  opened_by: string | null;
  closed_by: string | null;
  opening_cash: number;
  cash_sales: number;
  cash_tips: number;
  cash_refunds: number;
  expected_cash: number;
  counted_cash: number | null;
  difference: number;
  close_note: string | null;
};
