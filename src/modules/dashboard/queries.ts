import { pool } from "@/db";

export async function getDashboard() {
  const [kpis, stock, top, payments, daily] = await Promise.all([
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
  ]);
  return { kpis: kpis.rows[0], stock: stock.rows[0], top: top.rows, payments: payments.rows, daily: daily.rows };
}
