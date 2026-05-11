-- Move seção "Documentos" da coluna esquerda para a coluna direita
-- order_index 25 = entre trip_info(10) e payment(30)
UPDATE sections
SET position = 'right_column',
    order_index = 25
WHERE key = 'documentos';
