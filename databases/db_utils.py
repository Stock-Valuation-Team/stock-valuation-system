

def prepare_insert_stmt(table_name, table_col_names):
    cols_to_insert = []
    for col in table_col_names:
        if any(c.isupper() for c in col):
            cols_to_insert.append('"' + col + '"')
        else:
            cols_to_insert.append(col)
    cols_str = ", ".join(cols_to_insert)

    ins_val = '%s'
    for col in table_col_names[1:]:
        ins_val = ins_val + ',%s'
    insert_stmt = 'INSERT INTO ' + table_name + ' (' + cols_str + ') VALUES (' + ins_val + ')'
    return insert_stmt