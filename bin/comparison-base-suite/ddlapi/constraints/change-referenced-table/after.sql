CREATE TABLE legacy(id int primary key); CREATE TABLE target(id int primary key); CREATE TABLE u(ref int references target(id));
