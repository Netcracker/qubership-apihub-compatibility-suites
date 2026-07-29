create table t(active bool, deleted bool);
create index idx on t(active) where active=true;
