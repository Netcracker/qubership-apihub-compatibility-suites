CREATE TABLE parent (
    id INT PRIMARY KEY
);

CREATE TABLE child (
    a INT,
    b INT,
    FOREIGN KEY(a,b) REFERENCES parent(id,id)
);
