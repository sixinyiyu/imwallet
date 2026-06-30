const fs = require('fs');
const f = 'D:/QAX_Fabric_workspace/imwallet/apps/server/src/routes/wallet.rs';
let content = fs.readFileSync(f, 'utf-8');

const old = `    // 构建 IN 子句
    let in_clause: Vec<String> = filtered_wids.iter().map(|w| format!("'{}'" , w.replace("'", "''"))).collect();
    let in_sql = in_clause.join(",");

    let total: u64 = crate::db::query::query_count(
        &state.db,
        &format!("SELECT COUNT(*) as cnt FROM recharges WHERE wallet_id IN ({})", in_sql),
        vals![],
    ).await?;

    let rows: Vec<crate::models::Recharge> = crate::db::query::query(
        &state.db,
        &format!("SELECT * FROM recharges WHERE wallet_id IN ({}) ORDER BY created_at DESC LIMIT $1 OFFSET $2", in_sql),
        vals![query.limit as i64, offset as i64],
    ).await?;`;

const new_ = `    // 参数化 IN 子句：构建 WHERE wallet_id IN ($1, $2, ...) + vals
    let placeholders: Vec<String> = filtered_wids.iter().enumerate()
        .map(|(i, _)| format!("${}" , i + 1))
        .collect();
    let in_sql = placeholders.join(",");
    let args: Vec<rbs::value::Value> = filtered_wids.iter()
        .map(|w| rbs::value::Value::String(w.clone()))
        .collect();

    let total: u64 = crate::db::query::query_count(
        &state.db,
        &format!("SELECT COUNT(*) as cnt FROM recharges WHERE wallet_id IN ({})", in_sql),
        args.clone(),
    ).await?;

    // 分页参数追加到 args 末尾
    let mut page_args = args;
    page_args.push(rbs::value::Value::I64(query.limit as i64));
    page_args.push(rbs::value::Value::I64(offset as i64));
    let limit_placeholder = format!("${}" , filtered_wids.len() + 1);
    let offset_placeholder = format!("${}" , filtered_wids.len() + 2);

    let rows: Vec<crate::models::Recharge> = crate::db::query::query(
        &state.db,
        &format!("SELECT * FROM recharges WHERE wallet_id IN ({}) ORDER BY created_at DESC LIMIT {} OFFSET {}", in_sql, limit_placeholder, offset_placeholder),
        page_args,
    ).await?;`;

content = content.replace(old, new_);
fs.writeFileSync(f, content, 'utf-8');
console.log('OK');
