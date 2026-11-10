-- DB-level CHECK constraints from docs/04-database-schema.md §4 (Prisma can't express these).
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_price_check"   CHECK ("price" >= 0),
  ADD CONSTRAINT "Product_cost_check"    CHECK ("cost" >= 0),
  ADD CONSTRAINT "Product_taxRate_check" CHECK ("taxRate" BETWEEN 0 AND 100);

ALTER TABLE "SaleItem"
  ADD CONSTRAINT "SaleItem_qty_check"     CHECK ("qty" > 0),
  ADD CONSTRAINT "SaleItem_taxRate_check" CHECK ("taxRate" BETWEEN 0 AND 100);

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amount_check" CHECK ("amount" > 0);
