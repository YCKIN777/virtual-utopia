# PostgreSQL 初始化

阶段一只初始化空表结构，不写入业务数据，也不包含业务查询逻辑。

```powershell
createdb virtual_utopia
psql -d virtual_utopia -f .\database\schema.sql
```

若数据库名称不同，请同步调整 `backend/.env.*` 中的 `DATABASE_URL`。
