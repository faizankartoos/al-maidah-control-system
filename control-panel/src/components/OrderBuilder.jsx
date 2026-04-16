import { useState, useEffect } from "react";

function getSortedCategories(products) {
  return [...new Set(products.map((product) => product.category))]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

export default function OrderBuilder({
  items,
  setItems,
  discount,
  setDiscount,
  deliveryCharge,
  setDeliveryCharge,
  orderType
}) {

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);

  useEffect(() => {

    fetch("http://localhost:8000/api/menu/")
      .then(res => res.json())
      .then(data => {

        setProducts(data);

        const cats = getSortedCategories(data);
        setCategories(cats);

        if (cats.length) setSelectedCategory(cats[0]);

      });

  }, []);



  function addItem(product) {

    const existing = items.find(i => i.name === product.name);

    if (existing) {

      setItems(items.map(i =>
        i.name === product.name
          ? { ...i, qty: i.qty + 1 }
          : i
      ));

    } else {

      setItems([
        ...items,
        {
          name: product.name,
          price: Number(product.price),
          qty: 1
        }
      ]);

    }

  }



  function removeItem(item) {

    const existing = items.find(i => i.name === item.name);

    if (existing.qty === 1) {

      setItems(items.filter(i => i.name !== item.name));

    } else {

      setItems(items.map(i =>
        i.name === item.name
          ? { ...i, qty: i.qty - 1 }
          : i
      ));

    }

  }



  const subtotal = items.reduce(
    (sum, i) => sum + i.price * i.qty,
    0
  );

  const total = subtotal - discount + deliveryCharge;



  return (

    <div className="grid grid-cols-[220px_1fr_350px] gap-4 h-[520px]">


      {/* Categories */}

      <div className="bg-slate-900 rounded-lg p-3 overflow-y-auto">

        <div className="font-semibold mb-3">
          Categories
        </div>

        {categories.map(cat => (

          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`block w-full text-left px-3 py-2 mb-2 rounded ${
              selectedCategory === cat
                ? "bg-blue-600"
                : "bg-slate-700 hover:bg-slate-600"
            }`}
          >
            {cat}
          </button>

        ))}

      </div>



      {/* Menu */}

      <div className="bg-slate-900 rounded-lg p-4 overflow-y-auto">

        <div className="font-semibold mb-4">
          {selectedCategory}
        </div>

        {products
          .filter(p => p.category === selectedCategory)
          .map(product => (

            <div
              key={product.id}
              className="flex justify-between items-center border border-slate-700 rounded p-3 mb-3"
            >

              <div>

                <div>{product.name}</div>

                <div className="text-sm text-slate-400">
                  ₹{product.price}
                </div>

              </div>

              <button
                onClick={() => addItem(product)}
                className="bg-green-600 px-4 py-2 text-xl rounded-lg"
              >
                +
              </button>

            </div>

          ))}

      </div>



      {/* Order Summary */}

      <div className="bg-slate-900 rounded-lg p-4 flex flex-col">

        <div className="font-semibold mb-4">
          Order
        </div>

        <div className="flex-1 overflow-y-auto">

          {items.map(item => (

            <div
              key={item.name}
              className="flex justify-between items-center mb-3"
            >

              <span>
                {item.name} x{item.qty}
              </span>

              <div className="flex gap-2">

                <button
                  onClick={() => removeItem(item)}
                  className="bg-red-600 px-3 rounded"
                >
                  -
                </button>

                <button
                  onClick={() => addItem(item)}
                  className="bg-green-600 px-3 rounded"
                >
                  +
                </button>

              </div>

            </div>

          ))}

        </div>



        <div className="border-t border-slate-700 pt-3">

          <div className="mb-2">
            Subtotal: ₹{subtotal}
          </div>

          {orderType === "DELIVERY" && (

            <input
              value={deliveryCharge}
              onChange={e => setDeliveryCharge(Number(e.target.value))}
              className="w-full p-2 rounded text-black mb-3"
              placeholder="Delivery Charge"
            />

          )}

          <input
            value={discount}
            onChange={e => setDiscount(Number(e.target.value))}
            className="w-full p-2 rounded text-black mb-3"
            placeholder="Discount"
          />

          <div className="font-bold text-lg">
            Total: ₹{total}
          </div>

        </div>

      </div>

    </div>

  );

}
