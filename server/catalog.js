
const catalog = {
  Smartphones: [
    ['Samsung Galaxy S24', 64999],
    ['Samsung Galaxy A55', 32999],
    ['Apple iPhone 15', 59999],
    ['Apple iPhone 16', 69999],
    ['OnePlus 12R', 38999],
    ['OnePlus Nord 4', 29999],
    ['Redmi Note 13 Pro', 24999],
    ['Redmi 13 5G', 13999],
    ['Realme GT 6', 35999],
    ['Realme Narzo 70', 16999],
    ['Vivo V30', 32999],
    ['Vivo T3', 19999],
    ['Oppo Reno 11', 29999],
    ['Nothing Phone 2a', 23999],
    ['Motorola Edge 50', 27999]
  ],

  Laptops: [
    ['ASUS Vivobook 15', 45999],
    ['ASUS TUF Gaming F15', 74999],
    ['HP Pavilion 15', 62999],
    ['HP Victus 15', 69999],
    ['Lenovo IdeaPad Slim 3', 42999],
    ['Lenovo LOQ Gaming', 75999],
    ['Dell Inspiron 15', 52999],
    ['Dell G15 Gaming', 82999],
    ['Acer Aspire 7', 49999],
    ['Acer Nitro V', 72999],
    ['Apple MacBook Air M2', 89999],
    ['Apple MacBook Air M3', 109999],
    ['MSI Thin 15', 64999],
    ['Samsung Galaxy Book4', 64999],
    ['LG Gram 16', 119999]
  ],

  Audio: [
    ['Sony WH-1000XM5', 29999],
    ['Sony WF-1000XM5', 19999],
    ['JBL Tune 770NC', 6999],
    ['JBL Live Pro 2', 9999],
    ['boAt Rockerz 450', 1499],
    ['boAt Airdopes 141', 1299],
    ['Noise Buds VS104', 1199],
    ['Realme Buds Air 5', 3499],
    ['OnePlus Buds 3', 5499],
    ['Samsung Galaxy Buds FE', 6999]
  ],

  Wearables: [
    ['Apple Watch SE', 29999],
    ['Samsung Galaxy Watch6', 19999],
    ['Noise ColorFit Pro 5', 3999],
    ['boAt Wave Sigma', 1999],
    ['Amazfit GTR Mini', 9999]
  ],

  Accessories: [
    ['Logitech MX Master 3S', 9999],
    ['Logitech K380 Keyboard', 2999],
    ['Razer DeathAdder V2', 3499],
    ['Corsair K55 RGB Keyboard', 4999],
    ['Samsung T7 Portable SSD', 8999],
    ['SanDisk Extreme Portable SSD', 9999],
    ['WD My Passport 2TB', 6499],
    ['HP Wireless Mouse 250', 899],
    ['Dell 24 Inch Monitor', 12999],
    ['LG UltraGear Gaming Monitor', 18999],
    ['Anker USB-C Hub', 3499],
    ['TP-Link Archer C6 Router', 2499],
    ['Logitech C920 Webcam', 6999],
    ['HyperX Cloud Stinger 2', 4999],
    ['Portronics Laptop Stand', 1299]
  ]
};

// Category icons
const categoryIcons = {
  Smartphones: '\u{1F4F1}',
  Laptops: '\u{1F4BB}',
  Audio: '\u{1F3A7}',
  Wearables: '\u231A',
  Accessories: '\u2328\uFE0F'
};

// Generate products with unique SKUs and simulated prices
export const products = Object.entries(catalog).flatMap(
  ([category, items]) =>
    items.map(([name, price]) => {
      const sku = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      return {
        sku,
        name,
        category,
        icon: categoryIcons[category],

        // Prices are stored in paise.
        // Store 2 starts at 4% below Store 1.
        prices: [
          Math.round(price * 100),
          Math.round(price * 100 * 0.96)
        ]
      };
    })
);

// Indian-themed fictional demo storefronts
export const stores = [
  {
    id: 'bharattech',
    name: 'BharatTech Demo'
  },
  {
    id: 'indiadeals',
    name: 'IndiaDeals Demo'
  }
];

// Generate listings for every product in both stores
export function seedListings() {
  return products.flatMap(product =>
    stores.map((store, index) => ({
      id: `${store.id}:${product.sku}`,
      sku: product.sku,
      name: product.name,
      store: store.id,
      path: `/stores/${store.id}/products/${product.sku}`,
      price: product.prices[index]
    }))
  );
}
