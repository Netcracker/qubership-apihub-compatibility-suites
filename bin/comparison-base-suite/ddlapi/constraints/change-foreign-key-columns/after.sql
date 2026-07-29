create table parent(id int primary key);
create table child(a int, b int, foreign key(a,b) references parent(id,id));
