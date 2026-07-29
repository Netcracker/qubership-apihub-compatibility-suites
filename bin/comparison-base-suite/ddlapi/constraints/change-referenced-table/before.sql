create table legacy(id int primary key);
create table target(id int primary key);
create table u(ref int references legacy(id));
