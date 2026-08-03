-- Enum values must commit before later migrations use them in indexes or data.
alter type public.order_payment_method add value if not exists 'qr';
