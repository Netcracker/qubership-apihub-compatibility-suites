create table orders(price numeric, qty int, total numeric generated always as (price * qty) stored);
