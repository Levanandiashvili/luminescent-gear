// Interface strings. Product and brand texts come from the admin panel (English, with optional Georgian).
const S = {
  en: {
    catalog: 'Catalog', brands: 'Brands', about: 'About', contact: 'Contact', cart: 'Cart',
    search: 'Search', search_ph: 'Search products', all_products: 'All products',
    view_catalog: 'Browse the catalog', see_brand: 'See all {brand}', products_n: '{n} products', products_1: '1 product',
    add_to_cart: 'Add to cart', added: 'Added to cart', request_price: 'Ask for a price',
    price_on_request: 'Price on request', from: 'from', incl_vat: 'incl. VAT', approx: 'approx.',
    in_stock: 'In stock in Tbilisi', order: 'Made to order', preorder: 'Pre-order', on_request: 'On request',
    lead_time: 'Delivery', specs: 'Specifications', description: 'About this product', related: 'More from {brand}',
    cart_empty: 'Your cart is empty. Add products from the catalog to get an invoice.',
    qty: 'Qty', remove: 'Remove', subtotal: 'Total', continue: 'Continue shopping',
    get_invoice: 'Get invoice', checkout_title: 'Invoice details',
    checkout_intro: 'We issue an invoice for bank transfer. There is no card payment — once the transfer arrives we confirm delivery.',
    buyer_type: 'Buying as', person: 'Private person', company: 'Company',
    full_name: 'Full name', company_name: 'Company name', id_code: 'Personal ID / company ID code',
    email: 'Email', phone: 'Phone', address: 'Delivery address', city: 'City', notes: 'Notes (optional)',
    invoice_currency: 'Invoice currency', create_invoice: 'Create invoice',
    rate_note: 'GEL prices use the {source} of {rate} GEL per euro.',
    invoice: 'Invoice', invoice_no: 'Invoice no.', date: 'Date', valid_until: 'Pay by',
    seller: 'Seller', buyer: 'Buyer', item: 'Item', unit_price: 'Unit price', amount: 'Amount',
    total: 'Total', vat_included: 'Includes VAT {rate}%', vat_none: 'Seller is not registered for VAT',
    pay_to: 'Payment details', beneficiary: 'Beneficiary', bank: 'Bank', iban: 'IBAN', swift: 'SWIFT',
    reference: 'Payment reference', print: 'Download PDF / print', back_to_shop: 'Back to the shop',
    invoice_ready: 'Your invoice is ready', invoice_ready_text: 'Save or print it, then pay by bank transfer using the invoice number as the reference. We have received your order and will be in touch.',
    rate_used: 'Exchange rate: 1 EUR = {rate} GEL ({source}, {date})',
    status: 'Status', awaiting_payment: 'Awaiting payment', paid: 'Paid', shipped: 'Shipped', completed: 'Completed', cancelled: 'Cancelled',
    official_dealer: 'Brands', not_found: 'This page does not exist.', home: 'Home',
    required: 'Required', invalid_email: 'Enter a valid email address', cart_changed: 'Some items in your cart are no longer available and were removed.',
    footer_pay: 'Payment by bank transfer in GEL or EUR', footer_rate: 'Today: 1 EUR = {rate} GEL',
    filter_all: 'All', sort: 'Sort', ask_whatsapp: 'Ask on WhatsApp', ask_email: 'Ask by email',
    est_price: 'Estimated price', est_note: 'Estimated retail price. We confirm the final price, delivery and lead time with your quote.',
    request_quote: 'Request a quote', call_us: 'Call us', options: 'Options and prices', option: 'Option',
    footer_quote: 'Prices are estimates. Ask us for a quote in GEL or EUR.', from_short: 'from',
  },
};

export function translator(lang) {
  const dict = S[lang] || S.en;
  return (key, vars = {}) => {
    let s = dict[key] ?? S.en[key] ?? key;
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
    return s;
  };
}
export const LANGS = ['en'];
/** Pick the Georgian field when the visitor reads Georgian and it is filled in. */
export const loc = (obj, field, lang) => (lang === 'ka' && obj?.[`${field}_ka`]) ? obj[`${field}_ka`] : (obj?.[field] ?? '');
