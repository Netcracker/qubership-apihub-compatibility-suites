CREATE TABLE t(id int, code int, primary key(id,code)); CREATE TABLE u(ref int references t(id));
