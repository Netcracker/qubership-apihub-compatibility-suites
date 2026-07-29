create table t(id int primary key);
create table u(ref int references t(id) on delete cascade);
