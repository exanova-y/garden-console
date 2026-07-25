# D1 Migrations

Use ordered, forward-only migrations named `NNNN_description.sql`. Never use
`DROP TABLE IF EXISTS` as deployment initialization. Production migrations must
preserve existing account and vault data.
