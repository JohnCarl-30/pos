#!/usr/bin/env bash
set -u
DB=postgresql://postgres:postgres@127.0.0.1:54322/postgres
S=aaaaaaaa-0000-4000-8000-000000000001
O=aaaaaaaa-0000-4000-8000-000000000002
CLAIMS='{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}'
REG=$(psql "$DB" -Atc "select id from public.registers where name = 'Counter 2' and store_id = '00000000-0000-0000-0000-000000000101'")
psql "$DB" -q -v ON_ERROR_STOP=1 <<SQL
insert into public.register_sessions (id, register_id, opened_by) values ('$S', '$REG', '00000000-0000-0000-0000-000000000203');
insert into public.orders (id, store_id, register_id, session_id, staff_id, receipt_number, subtotal, tax_total, total)
  values ('$O', '00000000-0000-0000-0000-000000000101', '$REG', '$S', '00000000-0000-0000-0000-000000000203', 900, 300, 0, 300);
insert into public.payments (order_id, method, amount) values ('$O', 'cash', 300);
SQL
psql "$DB" -q >/dev/null <<SQL &
begin;
set local role authenticated;
set local request.jwt.claims = '$CLAIMS';
select public.void_order('$O', 'race');
select pg_sleep(3);
rollback;
SQL
sleep 1
OUT=$(psql "$DB" -At 2>&1 <<SQL
set lock_timeout = '1s';
begin;
set local role authenticated;
set local request.jwt.claims = '$CLAIMS';
select public.close_register('$S', 0);
rollback;
SQL
)
wait
psql "$DB" -q <<SQL
delete from public.payments where order_id = '$O';
delete from public.orders where id = '$O';
delete from public.register_sessions where id = '$S';
SQL
if echo "$OUT" | grep -q "lock timeout"; then echo "PASS: close waited for the void"; exit 0; fi
echo "FAIL: close ran while a void was in flight: $OUT"; exit 1
