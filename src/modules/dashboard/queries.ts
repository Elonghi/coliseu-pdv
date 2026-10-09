import { pool } from "@/db";

export async function getDashboard() {
  const [kpis, stock, top, payments, daily, financial, cashFlow] = await Promise.all([
    pool.query<{ today_cents: number; week_cents: number; month_cents: number; previous_month_cents: number; today_count: number; month_count: number; avg_cents: number }>(`SELECT
      COALESCE(sum(total_cents) FILTER (WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'),0)::int AS today_cents,
      COALESCE(sum(total_cents) FILTER (WHERE created_at >= date_trunc('week',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'),0)::int AS week_cents,
      COALESCE(sum(total_cents) FILTER (WHERE created_at >= date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'),0)::int AS month_cents,
      COALESCE(sum(total_cents) FILTER (WHERE created_at >= (date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo')-interval '1 month') AT TIME ZONE 'America/Sao_Paulo' AND created_at < date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'),0)::int AS previous_month_cents,
      count(*) FILTER (WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')::int AS today_count,
      count(*) FILTER (WHERE created_at >= date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')::int AS month_count,
      COALESCE(avg(total_cents) FILTER (WHERE created_at >= date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'),0)::int AS avg_cents
      FROM sales WHERE status='CONFIRMED'`),
    pool.query<{ low: number; empty: number }>("SELECT count(*) FILTER (WHERE stock_quantity>0 AND stock_quantity<=minimum_stock)::int AS low,count(*) FILTER (WHERE stock_quantity=0)::int AS empty FROM products WHERE active=true"),
    pool.query<{ name: string; quantity: number; revenue_cents: number; margin_cents: number }>(`SELECT si.product_name AS name,sum(si.quantity)::int AS quantity,sum(si.total_cents)::int AS revenue_cents,sum((si.unit_price_cents-si.unit_cost_cents)*si.quantity-si.discount_cents)::int AS margin_cents FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.status='CONFIRMED' AND s.created_at>=date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' GROUP BY si.product_name ORDER BY quantity DESC LIMIT 7`),
    pool.query<{ name: string; total_cents: number }>(`SELECT pm.name,sum(p.amount_applied_cents)::int AS total_cents FROM payments p JOIN payment_methods pm ON pm.code=p.method_code JOIN sales s ON s.id=p.sale_id WHERE s.status='CONFIRMED' AND s.created_at>=date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' GROUP BY pm.name ORDER BY total_cents DESC`),
    pool.query<{ day: string; revenue_cents: number; sales: number }>(`WITH days AS (SELECT generate_series(current_date-interval '13 day',current_date,interval '1 day')::date AS report_date) SELECT to_char(d.report_date,'DD/MM') AS day,COALESCE(sum(s.total_cents),0)::int AS revenue_cents,count(s.id)::int AS sales FROM days d LEFT JOIN sales s ON (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date=d.report_date AND s.status='CONFIRMED' GROUP BY d.report_date ORDER BY d.report_date`),
    pool.query<{ receivable_cents:number; payable_cents:number; overdue_receivable_cents:number; overdue_payable_cents:number; player_credit_cents:number; player_debt_cents:number }>(`SELECT
      COALESCE((SELECT sum(i.amount_cents-i.settled_cents) FROM financial_installments i JOIN financial_accounts a ON a.id=i.account_id WHERE a.type='RECEIVABLE' AND i.status IN ('OPEN','PARTIAL')),0)::int receivable_cents,
      COALESCE((SELECT sum(i.amount_cents-i.settled_cents) FROM financial_installments i JOIN financial_accounts a ON a.id=i.account_id WHERE a.type='PAYABLE' AND i.status IN ('OPEN','PARTIAL')),0)::int payable_cents,
      COALESCE((SELECT sum(i.amount_cents-i.settled_cents) FROM financial_installments i JOIN financial_accounts a ON a.id=i.account_id WHERE a.type='RECEIVABLE' AND i.status IN ('OPEN','PARTIAL') AND i.due_date < (now() AT TIME ZONE 'America/Sao_Paulo')::date),0)::int overdue_receivable_cents,
      COALESCE((SELECT sum(i.amount_cents-i.settled_cents) FROM financial_installments i JOIN financial_accounts a ON a.id=i.account_id WHERE a.type='PAYABLE' AND i.status IN ('OPEN','PARTIAL') AND i.due_date < (now() AT TIME ZONE 'America/Sao_Paulo')::date),0)::int overdue_payable_cents,
      COALESCE((SELECT sum(credit_balance_cents) FROM players WHERE active=true AND credit_balance_cents>0),0)::int player_credit_cents,
      ABS(COALESCE((SELECT sum(credit_balance_cents) FROM players WHERE active=true AND credit_balance_cents<0),0))::int player_debt_cents`),
    pool.query<{ day:string; received_cents:number; paid_cents:number }>(`WITH days AS (SELECT generate_series(current_date-interval '13 days',current_date,interval '1 day')::date AS report_date)
      SELECT to_char(d.report_date,'DD/MM') AS "day",
      COALESCE(sum(fs.amount_cents) FILTER (WHERE a.type='RECEIVABLE'),0)::int AS received_cents,
      COALESCE(sum(fs.amount_cents) FILTER (WHERE a.type='PAYABLE'),0)::int AS paid_cents
      FROM days d LEFT JOIN financial_settlements fs ON (fs.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date=d.report_date
      LEFT JOIN financial_installments i ON i.id=fs.installment_id LEFT JOIN financial_accounts a ON a.id=i.account_id GROUP BY d.report_date ORDER BY d.report_date`),
  ]);
  return { kpis: kpis.rows[0], stock: stock.rows[0], top: top.rows, payments: payments.rows, daily: daily.rows, financial: financial.rows[0], cashFlow: cashFlow.rows };
}
