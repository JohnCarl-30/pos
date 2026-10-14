begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select is(private.refund_line(650, 50, 2, 0, 1), '{"amount":325,"tax":25}'::jsonb, 'one of two splits evenly');
select is(private.refund_line(650, 50, 2, 1, 1), '{"amount":325,"tax":25}'::jsonb, 'second of two returns the rest');
select is(private.refund_line(1001, 91, 3, 0, 1), '{"amount":334,"tax":30}'::jsonb, 'first of three rounds half-even');
select is(private.refund_line(1001, 91, 3, 1, 1), '{"amount":333,"tax":31}'::jsonb, 'second of three');
select is(private.refund_line(1001, 91, 3, 2, 1), '{"amount":334,"tax":30}'::jsonb, 'last of three returns exactly the remainder');
select is(private.refund_line(5, 3, 2, 0, 1), '{"amount":2,"tax":2}'::jsonb, 'an exact half rounds to even');
select is(private.refund_line(990, 90, 3, 1, 2), '{"amount":660,"tax":60}'::jsonb, 'two of three at once');
select is(private.refund_line(1624, 124, 1, 0, 1), '{"amount":1624,"tax":124}'::jsonb, 'a single item refunds in full');

select * from finish();
rollback;
