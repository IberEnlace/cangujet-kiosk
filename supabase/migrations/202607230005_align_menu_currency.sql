-- Products are globally priced in this schema, so every active branch must use
-- the same currency. Align previously seeded product rows with that currency.
do $$
declare
  v_currency char(3);
  v_currency_count integer;
begin
  select count(distinct b.currency), min(b.currency)
    into v_currency_count, v_currency
  from public.branches b
  where b.is_active;

  if v_currency_count = 0 then
    raise exception using errcode = 'P0002', message = 'active_branch_required';
  end if;
  if v_currency_count > 1 then
    raise exception using errcode = '22023', message = 'multiple_active_branch_currencies_not_supported';
  end if;

  update public.products
  set currency = v_currency,
      updated_at = now()
  where currency <> v_currency;
end;
$$;
