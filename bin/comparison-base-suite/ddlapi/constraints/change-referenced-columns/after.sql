create table t(id int, code int, primary key(id,code));
create table u(ref int references t(code));
