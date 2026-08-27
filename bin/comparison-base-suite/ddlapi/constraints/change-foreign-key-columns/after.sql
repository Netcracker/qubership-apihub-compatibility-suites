CREATE TABLE parent(id int primary key); CREATE TABLE child(a int, b int, foreign key(a,b) references parent(id,id));
