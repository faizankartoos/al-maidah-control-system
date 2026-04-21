import { useState, useEffect } from "react";
import api, { buildApiUrl } from "../services/api";
import AreaAutocomplete from "./AreaAutocomplete";

const ORDER_TYPE_META = {
  DINE_IN: {
    label: "Dine In",
    accent: "from-amber-500/20 via-orange-500/10 to-transparent",
    border: "border-amber-500/30",
    description: "For walk-in tables and seated guests inside the restaurant.",
  },
  TAKEAWAY: {
    label: "Takeaway",
    accent: "from-sky-500/20 via-cyan-500/10 to-transparent",
    border: "border-sky-500/30",
    description: "For packed orders collected from the counter.",
  },
  DELIVERY: {
    label: "Delivery",
    accent: "from-emerald-500/20 via-green-500/10 to-transparent",
    border: "border-emerald-500/30",
    description: "For orders that go out with an assigned delivery boy.",
  },
};

function getSortedCategories(products) {
  return [...new Set(products.map((product) => product.category))]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function OrdersTab({ externalMode = false }) {
  const inputStyle = `
  w-full bg-slate-600 p-3 rounded text-white
  outline-none border border-slate-700
  focus:border-green-500 focus:ring-2 focus:ring-green-500
  transition-all duration-200
  `
  
  const [toast,setToast] = useState(null)
  const [animatingId,setAnimatingId] = useState(null)
  const [showTypes,setShowTypes] = useState(false)
  const [orderType,setOrderType] = useState(null)
  const [decisionConfirmed,setDecisionConfirmed] = useState(false)
  const [deliveryBoys, setDeliveryBoys] = useState([])
  const [selectedDeliveryBoy, setSelectedDeliveryBoy] = useState("")
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [tableNumber, setTableNumber] = useState("");
  const [customTable, setCustomTable] = useState("");
  const [useCustomTable, setUseCustomTable] = useState(false);

  const [phone,setPhone] = useState("")
  const [name,setName] = useState("")
  const [address,setAddress] = useState("")
  const [selectedAreaId, setSelectedAreaId] = useState("")
  const [selectedAreaName, setSelectedAreaName] = useState("")
  const [orderNote,setOrderNote] = useState("")
  const [requireAcceptance, setRequireAcceptance] = useState(false)

  const [isScheduled,setIsScheduled] = useState(false)
  const [scheduleDate,setScheduleDate] = useState("")
  const [scheduleTime,setScheduleTime] = useState("")
  const [guestCount,setGuestCount] = useState("")

  const [products,setProducts] = useState([])
  const [categories,setCategories] = useState([])
  const [selectedCategory,setSelectedCategory] = useState(null)
  const [categorySearch,setCategorySearch] = useState("")
  const [productSearch,setProductSearch] = useState("")

  const [orderItems,setOrderItems] = useState([])

  const [discount,setDiscount] = useState("")
  const [deliveryCharge,setDeliveryCharge] = useState("")

  const [placing,setPlacing] = useState(false)

  const [showPaymentModal,setShowPaymentModal] = useState(false)
  const [showMethodModal,setShowMethodModal] = useState(false)
  const [showAmountModal,setShowAmountModal] = useState(false)

  const [paymentMethod,setPaymentMethod] = useState(null)
  const [amountReceived,setAmountReceived] = useState("")
  const [paymentCashAmount,setPaymentCashAmount] = useState("")
  const [paymentOnlineAmount,setPaymentOnlineAmount] = useState("")

  useEffect(() => {

  fetch(buildApiUrl("ledger/delivery-boys/"))
    .then(res => res.json())
    .then(data => setDeliveryBoys(data))

  }, [])


  useEffect(()=>{

    api.get("/menu/?available_only=true")
      .then(res=>{
        const data = res.data

        setProducts(data)

        const cats = getSortedCategories(data)
        setCategories(cats)

        if(cats.length) setSelectedCategory(cats[0])
        else setSelectedCategory(null)
      })
      .catch(() => {
        setProducts([])
        setCategories([])
        setSelectedCategory(null)
      })

  },[])

  useEffect(()=>{

    if(orderType !== "DINE_IN"){
      setGuestCount("")
    }

  },[orderType])


  function showToast(message,type="success"){

  setToast({message,type})

  setTimeout(()=>{
    setToast(null)
  },2500)

  }


  function addItem(product){

    const existing = orderItems.find(i=>i.id===product.id)

    if(existing){

      setOrderItems(orderItems.map(i =>
        i.id===product.id ? {...i,qty:i.qty+1} : i
      ))

    }else{

      setOrderItems([
        ...orderItems,
        {
          id:product.id,
          name:product.name,
          price:product.price,
          qty:1
        }
      ])

    }

  }




  function removeItem(product){

    const existing = orderItems.find(i=>i.id===product.id)

    if(existing.qty===1){

      setOrderItems(orderItems.filter(i=>i.id!==product.id))

    }else{

      setOrderItems(orderItems.map(i =>
        i.id===product.id ? {...i,qty:i.qty-1} : i
      ))

    }

  }


  const predefinedTables = [
  "Table 1",
  "Table 2",
  "Table 3",
  "Table 4",
  "Table 5",
  "Table 6",
  "Table 7",
  "Table 8",
  "Table 9",
  "Table 10",
  ];

  const subtotal = orderItems.reduce(
    (sum,i)=>sum+i.price*i.qty,0
  )

  const total = subtotal - discount + deliveryCharge
  const totalItems = orderItems.reduce((sum,i)=>sum+i.qty,0)
  const shouldShowPhoneField = orderType === "TAKEAWAY" || orderType === "DELIVERY" || isScheduled
  const shouldShowNameField = orderType === "TAKEAWAY" || orderType === "DELIVERY" || isScheduled
  const catalogProducts = products
    .filter(p => !selectedCategory || p.category===selectedCategory)
    .filter(p => {
      const search = productSearch.trim().toLowerCase()
      if(!search) return true
      return (
        p.name.toLowerCase().includes(search) ||
        p.category.toLowerCase().includes(search)
      )
    })
  const filteredCategories = categories.filter((category) => {
    const search = categorySearch.trim().toLowerCase()
    if(!search) return true
    return category.toLowerCase().includes(search)
  })

  function resetOrderScreen(){

  setDecisionConfirmed(false)
  setOrderType(null)
  setShowTypes(false)

  setIsScheduled(false)
  setScheduleDate("")
  setScheduleTime("")
  setGuestCount("")

  setTableNumber("")
  setCustomTable("")
  setUseCustomTable(false)
  setPhone("")
  setName("")
  setAddress("")
  setSelectedAreaId("")
  setSelectedAreaName("")
  setOrderNote("")
  setRequireAcceptance(false)

  setSelectedDeliveryBoy("")
  setCategorySearch("")

  setOrderItems([])
  setDiscount("")
  setDeliveryCharge("")
  setAmountReceived("")
  setPaymentMethod(null)
  setPaymentCashAmount("")
  setPaymentOnlineAmount("")
  setShowPaymentModal(false)
  setShowMethodModal(false)
  setShowAmountModal(false)

}

  async function submitOrder(finalMode,finalMethod,amount,extra = {}){

    if(!orderType){
      showToast("Order type missing","error")
      return
    }

    if(externalMode && requireAcceptance && finalMode === "PAY_NOW"){
      showToast("Require Acceptance orders must be submitted with Pay Later.","warning")
      return
    }

    setPlacing(true)

    const payload = {
      scheduled_time: isScheduled ? `${scheduleDate}T${scheduleTime}` : null,
      guest_count: isScheduled && guestCount ? Number(guestCount) : null,
      order_type:orderType,
      delivery_boy_id:selectedDeliveryBoy,
      payment_mode:finalMode,
      payment_method:finalMethod,
      payment_amount:amount,
      cash_amount: extra.cash_amount ?? 0,
      online_amount: extra.online_amount ?? 0,
      deduct_change: extra.deduct_change ?? false,

      table_number: useCustomTable ? customTable : tableNumber,
      phone:phone,
      name:name,
      address:address,
      area_id: orderType === "DELIVERY" ? selectedAreaId || null : null,
      order_note: orderNote.trim() || null,

      discount:discount,
      delivery_charge:deliveryCharge,
      submission_source: externalMode ? "EXTERNAL" : "INTERNAL",
      require_acceptance: externalMode ? requireAcceptance : false,

      items:orderItems

    }

    try{

      const res = await fetch(buildApiUrl("orders/create/"),{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify(payload)
      })

      const data = await res.json()

      if(res.ok){

        if (data.acceptance_status === "PENDING") {
          showToast("External order submitted for acceptance","success")
        } else {
          showToast("Order placed","success")
        }
        resetOrderScreen()

      }
      else{

        showToast(data.error || "Order failed","error")

      }

    }catch(e){

      showToast("Server error","error")

    }

    setPlacing(false)

  }



  function handlePlaceOrder(){

  if(orderItems.length===0){
    showToast("Add items first","warning")
    return
  }

  if(orderType === "DELIVERY"){
    setShowDeliveryModal(true)
    return
  }

  setShowPaymentModal(true)

  }



  function confirmPayment(){


    const amount = Number(amountReceived)

    if(!Number.isFinite(amount) || amount <= 0){
      showToast("Enter a valid received amount","warning")
      return
    }

    const cashAmount = Number(paymentCashAmount || 0)
    const onlineAmount = Number(paymentOnlineAmount || 0)

    if(paymentMethod === "MIXED"){
      if(cashAmount < 0 || onlineAmount < 0){
        showToast("Enter valid cash and online amounts","warning")
        return
      }

      if(Math.abs(cashAmount + onlineAmount - amount) > 0.009){
        showToast("Cash + Online must match the received amount","warning")
        return
      }
    }

    if(amount < total){
      showToast("Full payment required. Use Pay Later instead.","warning")
      return
    }

    if(paymentMethod === "ONLINE" && amount > total){
      showToast("Online payment cannot exceed the total bill amount","warning")
      return
    }

    const changeAmount = amount - total

    if(paymentMethod === "MIXED" && changeAmount > cashAmount){
      showToast("Change can only be returned from the cash portion","warning")
      return
    }

    const confirmed =
      changeAmount > 0
        ? window.confirm(
            `Deduct remaining ₹${changeAmount.toFixed(2)} you're giving back to the customer from cash drawer?`
          )
        : true

    if(!confirmed){
      return
    }

    submitOrder("PAY_NOW",paymentMethod,amount,{
      cash_amount: paymentMethod === "MIXED" ? cashAmount : 0,
      online_amount: paymentMethod === "MIXED" ? onlineAmount : 0,
      deduct_change: changeAmount > 0
    })

  }

        const ToastUI = toast && (
        <div className="fixed top-6 right-6 z-50">
          <div className={`px-5 py-3 rounded-lg shadow-lg text-white font-semibold
            ${toast.type === "error" ? "bg-red-600" :
            toast.type === "warning" ? "bg-yellow-500" :
            "bg-green-600"}
          `}>
            {toast.message}
          </div>
        </div>
      )

  /* ORDER TYPE SCREEN */

	const DeliveryModal = showDeliveryModal && (
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 px-4">

  <div className="w-full max-w-md rounded-xl bg-gray-900 p-6">

    <div className="flex justify-between mb-4">

      <h2 className="text-lg font-bold">
        Assign Delivery Boy
      </h2>

      <button
        onClick={()=>setShowDeliveryModal(false)}
        className="text-red-400"
      >
        ✕
      </button>

    </div>

    <div className="space-y-4">

      <select
        value={selectedDeliveryBoy}
        onChange={(e)=>setSelectedDeliveryBoy(e.target.value)}
        className="w-full p-3 rounded bg-gray-800"
      >

        <option value="">Select Delivery Boy</option>

        {deliveryBoys.map(boy => (
          <option key={boy.id} value={boy.id}>
            {boy.name}
          </option>
        ))}

      </select>

      <button
onClick={()=>{

  if(!selectedDeliveryBoy){
    showToast("Select delivery boy","warning")
    return
  }

	  setShowDeliveryModal(false)

	  setShowPaymentModal(true)

}}
className="w-full bg-green-600 py-3 rounded"
>
Assign Delivery Boy
</button>

    </div>

  </div>

	</div>
	)

	  if(!decisionConfirmed){

	  return(
	  <div className="space-y-6 text-white">
	    {ToastUI}
	    {DeliveryModal}

	    <div className="rounded-[28px] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),_transparent_35%),linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(15,23,42,0.84))] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.45)]">
	      <div className="flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-end md:justify-between">
	        <div>
	          <div className="text-xs uppercase tracking-[0.35em] text-sky-300">Orders Workspace</div>
	          <h2 className="mt-2 text-3xl font-semibold">Create New Order</h2>
	          <p className="mt-2 max-w-2xl text-sm text-slate-400">
	            Choose the order type, capture only the relevant details, and move into the cashier screen with a cleaner setup.
	          </p>
	        </div>

	        {orderType && (
	          <button
	            onClick={goBack}
	            className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
	          >
	            Back
	          </button>
	        )}
	      </div>

	      <div className="mt-6 grid gap-4 lg:grid-cols-3">
	        {Object.entries(ORDER_TYPE_META).map(([value, meta]) => (
	          <button
	            key={value}
	            onClick={()=>{
	              setOrderType(value)
	              setShowTypes(true)
	            }}
	            className={`rounded-3xl border p-5 text-left transition duration-200 ${
	              orderType === value
	                ? `${meta.border} bg-gradient-to-br ${meta.accent} shadow-[0_20px_45px_rgba(14,165,233,0.12)]`
	                : "border-slate-800 bg-slate-950/70 hover:border-slate-600 hover:bg-slate-900/80"
	            }`}
	          >
	            <div className="flex items-start justify-between gap-4">
	              <div>
	                <div className="text-lg font-semibold">{meta.label}</div>
	                <div className="mt-2 text-sm leading-6 text-slate-400">{meta.description}</div>
	              </div>
	              {orderType === value && (
	                <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
	                  Selected
	                </div>
	              )}
	            </div>
	          </button>
	        ))}
	      </div>

	      {orderType && (
	        <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
	          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
	            <div className="flex items-center justify-between gap-3">
	              <div>
	                <div className="text-lg font-semibold">Order Details</div>
	                <div className="mt-1 text-sm text-slate-400">
	                  {ORDER_TYPE_META[orderType].label} details only. Keep the form short and relevant.
	                </div>
	              </div>
	              <div className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
	                {isScheduled ? "Scheduled" : "Live"}
	              </div>
	            </div>

	            <div className="mt-5 grid gap-4 md:grid-cols-2">
	              {orderType === "DINE_IN" && (
	                <div className="md:col-span-2 space-y-3">
	                  <label className="text-sm font-medium text-slate-300">Table</label>
	                  <select
	                    value={useCustomTable ? "CUSTOM" : tableNumber}
	                    onChange={(e) => {
	                      if (e.target.value === "CUSTOM") {
	                        setUseCustomTable(true)
	                        setTableNumber("")
	                        setCustomTable("")
	                      } else {
	                        setUseCustomTable(false)
	                        setTableNumber(e.target.value)
	                        setCustomTable("")
	                      }
	                    }}
	                    className={inputStyle}
	                  >
	                    <option value="">Select Table</option>
	                    {predefinedTables.map(t => (
	                      <option key={t} value={t}>{t}</option>
	                    ))}
	                    <option value="CUSTOM">Custom Table</option>
	                  </select>

	                  {useCustomTable && (
	                    <input
	                      type="text"
	                      placeholder="Enter custom table name"
	                      value={customTable}
	                      onChange={(e)=>setCustomTable(e.target.value)}
	                      className={inputStyle}
	                    />
	                  )}
	                </div>
	              )}

	              {shouldShowNameField && (
	                <div>
	                  <label className="mb-2 block text-sm font-medium text-slate-300">
	                    Customer Name <span className="text-slate-500">(Optional)</span>
	                  </label>
	                  <input
	                    placeholder="Example: Adil"
	                    value={name}
	                    onChange={e=>setName(e.target.value)}
	                    className={inputStyle}
	                  />
	                </div>
	              )}

	              {shouldShowPhoneField && (
	                <div>
	                  <label className="mb-2 block text-sm font-medium text-slate-300">
	                    Phone Number
	                  </label>
	                  <input
	                    placeholder="Enter phone number"
	                    value={phone}
	                    onChange={e=>setPhone(e.target.value)}
	                    className={inputStyle}
	                  />
	                </div>
	              )}

	              {orderType==="DELIVERY" && (
	                <>
	                  <div className="md:col-span-2">
	                    <AreaAutocomplete
	                      selectedAreaId={selectedAreaId}
	                      selectedAreaName={selectedAreaName}
	                      onSelectArea={(area) => {
	                        setSelectedAreaId(String(area.id))
	                        setSelectedAreaName(area.name)
	                      }}
	                      onClearArea={() => {
	                        setSelectedAreaId("")
	                        setSelectedAreaName("")
	                      }}
	                      helperText="This is the standard delivery zone. After selecting it, write the exact house, lane, or landmark below."
	                    />
	                  </div>
	                  <div className="md:col-span-2">
	                    <label className="mb-2 block text-sm font-medium text-slate-300">
	                      Delivery Address
	                    </label>
	                    <textarea
	                      placeholder="Enter full delivery address"
	                      value={address}
	                      onChange={e=>setAddress(e.target.value)}
	                      className={`${inputStyle} min-h-[110px] resize-none`}
	                    />
	                  </div>
	                </>
	              )}
	            </div>
	          </div>

	          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
	            <div className="flex items-start justify-between gap-3">
	              <div>
	                <div className="text-lg font-semibold">Scheduling</div>
	                <div className="mt-1 text-sm text-slate-400">
	                  Available for dine-in, takeaway, and delivery. Scheduled orders always need a phone number.
	                </div>
	              </div>
	              <label className="inline-flex cursor-pointer items-center gap-3 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200">
	                <input
	                  type="checkbox"
	                  checked={isScheduled}
	                  onChange={(e)=>{
	                    const checked = e.target.checked
	                    setIsScheduled(checked)

	                    if(checked){
	                      const today = new Date().toISOString().split("T")[0]
	                      if(!scheduleDate){
	                        setScheduleDate(today)
	                      }
	                    }else{
	                      setScheduleDate("")
	                      setScheduleTime("")
	                      setGuestCount("")
	                    }
	                  }}
	                  className="h-4 w-4 accent-emerald-500"
	                />
	                Schedule Order
	              </label>
	            </div>

	            <div className="mt-5 grid gap-4">
	              {isScheduled ? (
	                <>
	                  <div className="grid gap-4 md:grid-cols-2">
	                    <input
	                      type="date"
	                      value={scheduleDate}
	                      min={new Date().toISOString().split("T")[0]}
	                      onChange={(e)=>setScheduleDate(e.target.value)}
	                      className={inputStyle}
	                    />
	                    <input
	                      type="time"
	                      value={scheduleTime}
	                      onChange={(e)=>setScheduleTime(e.target.value)}
	                      className={inputStyle}
	                    />
	                  </div>

	                  {orderType === "DINE_IN" && (
	                    <input
	                      type="number"
	                      min="1"
	                      placeholder="Number of guests"
	                      value={guestCount}
	                      onChange={(e)=>setGuestCount(e.target.value)}
	                      className={inputStyle}
	                    />
	                  )}

	                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
	                    This order will be created as scheduled and will stay out of the live queue until you start it from Manage Orders.
	                  </div>
	                </>
	              ) : (
	                <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-6 text-sm text-slate-400">
	                  Leave scheduling off to place the order directly into the live queue.
	                </div>
	              )}

	              <div className="grid gap-3 sm:grid-cols-2">
	                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
	                  <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Order Type</div>
	                  <div className="mt-2 text-lg font-semibold">{ORDER_TYPE_META[orderType].label}</div>
	                </div>
	                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
	                  <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Ready To Continue</div>
	                  <div className="mt-2 text-lg font-semibold">
	                    {isScheduled ? "Scheduled Setup" : "Live Setup"}
	                  </div>
	                </div>
	              </div>
	            </div>
	          </div>
	        </div>
	      )}

	      {orderType && (
	        <div className="mt-6 flex justify-end">
	          <button
	            onClick={()=>{
	              if(validateOrderDetails()){
	                setDecisionConfirmed(true)
	              }
	            }}
	            className="rounded-2xl bg-gradient-to-r from-emerald-500 to-green-500 px-8 py-3 text-lg font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:brightness-110"
	          >
	            Continue To Order Screen
	          </button>
	        </div>
	      )}
	    </div>
	  </div>
	  )

	}
	 function validateOrderDetails(){


	  if(isScheduled && !phone){
	    showToast("Phone number required for scheduled orders","warning")
	    return false
	  }

	  if(orderType === "TAKEAWAY"){

	    if(!phone){
      showToast("Phone number required for takeaway order","warning")
      return false
    }

  }

  if(orderType === "DELIVERY"){

    if(!phone || !address || !selectedAreaId){
      showToast("Phone, area, and address required for delivery order","warning")
      return false
    }

  }

	  if(isScheduled){
	    if(!scheduleDate || !scheduleTime){
	      showToast("Select scheduled date and time","warning")
	      return false
    }

    if(guestCount && Number(guestCount) <= 0){
      showToast("Enter a valid guest count","warning")
      return false
    }
  }

  return true

}



  function goBack(){

   if(orderType){
     setOrderType(null)
     return
   }

   if(showTypes){
     setShowTypes(false)
  }

 }



  /* MENU SCREEN */

  return(
  <>
    {ToastUI}
    {DeliveryModal}

    

	    <div className="px-0 py-3 text-white sm:p-6">

	      <div className="space-y-6">
	        <div className="rounded-[28px] border border-slate-800 bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.14),_transparent_30%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(15,23,42,0.88))] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.35)]">
	          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
	            <div>
	              <div className="text-xs uppercase tracking-[0.35em] text-emerald-300">Live Ordering</div>
	              <h2 className="mt-2 text-3xl font-semibold">
	                {ORDER_TYPE_META[orderType]?.label || "Order"} Workspace
	              </h2>
	              <p className="mt-2 text-sm text-slate-400">
	                Fast cashier view with cleaner summaries, richer search, and the same operational flow underneath.
	              </p>
	            </div>

	            <div className="flex flex-wrap gap-3">
	              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
	                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Status</div>
	                <div className="mt-1 text-lg font-semibold">{isScheduled ? "Scheduled" : "Live"}</div>
	              </div>
	              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
	                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Items</div>
	                <div className="mt-1 text-lg font-semibold">{totalItems}</div>
	              </div>
	              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
	                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Total</div>
	                <div className="mt-1 text-lg font-semibold">Rs {formatMoney(total)}</div>
	              </div>
	            </div>
	          </div>
	        </div>

	        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
	          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
	            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Customer</div>
	            <div className="mt-2 text-lg font-semibold">{name || "Walk-in / Not entered"}</div>
	            <div className="mt-1 text-sm text-slate-400">{phone || "No phone added yet"}</div>
	          </div>
	          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
	            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Table / Address</div>
	            <div className="mt-2 text-lg font-semibold">
	              {orderType === "DINE_IN"
	                ? (useCustomTable ? customTable : tableNumber) || "No table selected"
	                : orderType === "DELIVERY"
	                  ? (selectedAreaName ? `${selectedAreaName} • ${address || "Address pending"}` : (address || "Area and address pending"))
	                  : "Counter pickup"}
	            </div>
	          </div>
	          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
	            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Schedule</div>
	            <div className="mt-2 text-lg font-semibold">
	              {isScheduled ? `${scheduleDate || "-"} ${scheduleTime || ""}`.trim() : "Immediate order"}
	            </div>
	            {orderType === "DINE_IN" && isScheduled && guestCount && (
	              <div className="mt-1 text-sm text-slate-400">{guestCount} guests</div>
	            )}
	          </div>
	          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
	            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Order Note</div>
	            <div className="mt-2 text-sm leading-6 text-slate-300">
	              {orderNote || "No note added yet. Use this for kitchen or billing instructions."}
	            </div>
	          </div>
	        </div>

	        <div className="grid gap-4 xl:grid-cols-[220px_1fr_360px]">
	          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
	            <div className="text-lg font-semibold">Categories</div>
	            <div className="mt-1 text-sm text-slate-400">Switch quickly between menu groups.</div>

	            <div className="relative mt-4">
	              <svg
	                aria-hidden="true"
	                viewBox="0 0 24 24"
	                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
	                fill="none"
	                stroke="currentColor"
	                strokeWidth="2"
	                strokeLinecap="round"
	                strokeLinejoin="round"
	              >
	                <circle cx="11" cy="11" r="7" />
	                <path d="m20 20-3.5-3.5" />
	              </svg>
	              <input
	                placeholder="Search categories..."
	                value={categorySearch}
	                onChange={(e)=>setCategorySearch(e.target.value)}
	                className="w-full rounded-2xl border border-slate-700 bg-slate-900 py-3 pl-10 pr-4 text-sm text-white outline-none transition"
	              />
	            </div>

	            <div className="mt-4 space-y-2">
	              {filteredCategories.length === 0 && (
	                <div className="rounded-2xl border border-dashed border-slate-700 px-3 py-6 text-center text-sm text-slate-400">
	                  No categories match this search.
	                </div>
	              )}

	              {filteredCategories.map(cat=>(
	                <button
	                  key={cat}
	                  onClick={()=>setSelectedCategory(cat)}
	                  className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left transition ${
	                    selectedCategory===cat
	                      ? "border border-sky-500/30 bg-sky-500/10 text-white"
	                      : "border border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-600"
	                  }`}
	                >
	                  <span>{cat}</span>
	                  <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-400">
	                    {products.filter((product)=>product.category===cat).length}
	                  </span>
	                </button>
	              ))}
	            </div>
	          </div>

	          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
	            <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 md:flex-row md:items-end md:justify-between">
	              <div>
	                <div className="text-lg font-semibold">{selectedCategory || "Menu"}</div>
	                <div className="mt-1 text-sm text-slate-400">
	                  Search items, add fast, and keep the cashier flow moving.
	                </div>
	              </div>

	              <input
	                placeholder="Search menu items..."
	                value={productSearch}
	                onChange={(e)=>setProductSearch(e.target.value)}
	                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-500 md:w-72"
	              />
	            </div>

	            <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
	              {catalogProducts.length === 0 && (
	                <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-10 text-center text-sm text-slate-400 md:col-span-2 2xl:col-span-3">
	                  No menu items match this search in {selectedCategory || "the selected category"}.
	                </div>
	              )}

	              {catalogProducts.map(product=>(
	                <div
	                  key={product.id}
	                  className={`rounded-2xl border border-slate-800 bg-slate-900/70 p-4 transition ${
	                    animatingId === product.id ? "animate-add" : ""
	                  }`}
	                >
	                  <div className="flex items-start justify-between gap-3">
	                    <div>
	                      <div className="text-base font-semibold">{product.name}</div>
	                      <div className="mt-1 text-sm text-slate-400">{product.category}</div>
	                    </div>
	                    <div className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-semibold text-emerald-300">
	                      Rs {formatMoney(product.price)}
	                    </div>
	                  </div>

	                  <div className="mt-4 flex items-center justify-between">
	                    <div className="text-xs uppercase tracking-[0.25em] text-slate-500">
	                      {orderItems.find(i=>i.id===product.id)?.qty || 0} in order
	                    </div>
	                    <button
	                      onClick={()=>{
	                        setAnimatingId(product.id)
	                        addItem(product)
	                        setTimeout(()=>setAnimatingId(null),350)
	                      }}
	                      className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
	                    >
	                      Add
	                    </button>
	                  </div>
	                </div>
	              ))}
	            </div>
	          </div>

	          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
	            <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-4">
	              <div>
	                <div className="text-lg font-semibold">Order Summary</div>
	                <div className="mt-1 text-sm text-slate-400">Review items, charges, and cashier notes.</div>
	              </div>
	              <button
	                onClick={()=>{
	                  setOrderItems([])
	                  setDiscount("")
	                  setDeliveryCharge("")
	                  setOrderNote("")
	                }}
	                className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-rose-200 transition hover:bg-rose-500/20"
	              >
	                Clear
	              </button>
	            </div>

	            <div className="mt-4 max-h-[300px] space-y-3 overflow-y-auto pr-1">
	              {orderItems.length === 0 && (
	                <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-10 text-center text-sm text-slate-400">
	                  Add menu items to start building the order.
	                </div>
	              )}

	              {orderItems.map(item=>(
	                <div
	                  key={item.id}
	                  className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3"
	                >
	                  <div className="flex items-start justify-between gap-3">
	                    <div>
	                      <div className="font-semibold">{item.name}</div>
	                      <div className="mt-1 text-sm text-slate-400">Rs {formatMoney(item.price)} each</div>
	                    </div>
	                    <div className="text-sm font-semibold text-emerald-300">
	                      Rs {formatMoney(item.price * item.qty)}
	                    </div>
	                  </div>

	                  <div className="mt-3 flex items-center justify-between">
	                    <div className="text-xs uppercase tracking-[0.25em] text-slate-500">Qty {item.qty}</div>
	                    <div className="flex gap-2">
	                      <button
	                        onClick={()=>removeItem(item)}
	                        className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold"
	                      >
	                        -
	                      </button>
	                      <button
	                        onClick={()=>addItem(item)}
	                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold"
	                      >
	                        +
	                      </button>
	                    </div>
	                  </div>
	                </div>
	              ))}
	            </div>

	            <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
	              <div className="flex items-center justify-between gap-3">
	                <span className="text-sm text-slate-300">Discount</span>
	                <input
	                  type="number"
	                  value={discount}
	                  onChange={(e)=>setDiscount(Number(e.target.value))}
	                  className="w-28 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-right outline-none transition focus:border-emerald-500"
	                />
	              </div>

	              {orderType === "DELIVERY" && (
	                <div className="flex items-center justify-between gap-3">
	                  <span className="text-sm text-slate-300">Delivery Charge</span>
	                  <input
	                    type="number"
	                    value={deliveryCharge}
	                    onChange={(e)=>setDeliveryCharge(Number(e.target.value))}
	                    className="w-28 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-right outline-none transition focus:border-emerald-500"
	                  />
	                </div>
	              )}

	              <div>
	                <span className="mb-2 block text-sm text-slate-300">Order Note</span>
	                <textarea
	                  value={orderNote}
	                  onChange={(e)=>setOrderNote(e.target.value)}
	                  placeholder="Optional note for kitchen or billing"
	                  rows={3}
	                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-3 outline-none transition focus:border-emerald-500 resize-none"
	                />
	              </div>

	              {externalMode && (
	                <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
	                  <div className="flex items-start justify-between gap-4">
	                    <div>
	                      <div className="text-sm font-semibold text-amber-100">Require Acceptance</div>
	                      <div className="mt-1 text-sm leading-6 text-amber-50/80">
	                        If enabled, this external order will wait in External Orders until someone accepts or declines it.
	                      </div>
	                    </div>
	                    <label className="inline-flex cursor-pointer items-center gap-3">
	                      <span className={`text-xs font-semibold uppercase tracking-[0.24em] ${requireAcceptance ? "text-amber-100" : "text-slate-400"}`}>
	                        {requireAcceptance ? "On" : "Off"}
	                      </span>
	                      <input
	                        type="checkbox"
	                        checked={requireAcceptance}
	                        onChange={(e)=>setRequireAcceptance(e.target.checked)}
	                        className="h-5 w-5 rounded border-slate-500 bg-slate-900 text-amber-400 focus:ring-amber-400"
	                      />
	                    </label>
	                  </div>
	                </div>
	              )}

	              <div className="rounded-2xl bg-gradient-to-r from-emerald-500 to-green-500 p-4 text-white shadow-lg shadow-emerald-900/30">
	                <div className="flex items-center justify-between text-sm uppercase tracking-[0.25em] text-emerald-50/80">
	                  <span>Total</span>
	                  <span>{totalItems} items</span>
	                </div>
	                <div className="mt-2 text-3xl font-semibold">Rs {formatMoney(total)}</div>
	                <div className="mt-1 text-sm text-emerald-50/90">Subtotal Rs {formatMoney(subtotal)}</div>
	              </div>

	              <button
	                onClick={handlePlaceOrder}
	                className="w-full rounded-2xl bg-white px-4 py-3 text-base font-semibold text-slate-950 transition hover:bg-emerald-50"
	              >
	                {placing ? "Placing..." : "Place Order"}
	              </button>
	            </div>
	          </div>
	        </div>
	      </div>



      {showPaymentModal && (

        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-70 px-4">

          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-black">

            <button
              onClick={()=>submitOrder("PAY_LATER",null,0)}
              className="block w-full bg-yellow-400 p-3 rounded mb-3"
            >
              PAY LATER
            </button>

            <button
              disabled={externalMode && requireAcceptance}
              onClick={()=>{
                setShowPaymentModal(false)
                setShowMethodModal(true)
              }}
              className={`block w-full p-3 rounded ${externalMode && requireAcceptance ? "cursor-not-allowed bg-slate-300 text-slate-600" : "bg-green-600 text-white"}`}
            >
              PAY NOW
            </button>

            {externalMode && requireAcceptance && (
              <div className="mt-3 max-w-sm text-center text-sm text-slate-600">
                Orders waiting for acceptance stay on Pay Later so nothing financial is recorded before they are accepted.
              </div>
            )}

          </div>

        </div>

      )}

      



      {showMethodModal && (

        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-70 px-4">

          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-black">

            <button
              onClick={()=>{
                setPaymentMethod("CASH")
                setAmountReceived(total)
                setPaymentCashAmount("")
                setPaymentOnlineAmount("")
                setShowMethodModal(false)
                setShowAmountModal(true)
              }}
              className="block w-full bg-gray-700 text-white p-3 rounded mb-3"
            >
              CASH
            </button>

            <button
              onClick={()=>{
                setPaymentMethod("ONLINE")
                setAmountReceived(total)
                setPaymentCashAmount("")
                setPaymentOnlineAmount("")
                setShowMethodModal(false)
                setShowAmountModal(true)
              }}
              className="block w-full bg-blue-600 text-white p-3 rounded"
            >
              ONLINE
            </button>

            <button
              onClick={()=>{
                setPaymentMethod("MIXED")
                setAmountReceived(total)
                setPaymentCashAmount("")
                setPaymentOnlineAmount("")
                setShowMethodModal(false)
                setShowAmountModal(true)
              }}
              className="block w-full bg-emerald-600 text-white p-3 rounded mt-3"
            >
              MIXED
            </button>

          </div>

        </div>

      )}



      {showAmountModal && (

        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-70 px-4">

          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-black">

            <div className="mb-3">Total: ₹{total}</div>

            <input
              type="number"
              placeholder="Amount Received"
              value={amountReceived}
              onChange={(e)=>setAmountReceived(e.target.value)}
              className="w-full border p-2 mb-3"
            />

            {paymentMethod === "MIXED" && (
              <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  type="number"
                  placeholder="Cash Received"
                  value={paymentCashAmount}
                  onChange={(e)=>setPaymentCashAmount(e.target.value)}
                  className="w-full border p-2"
                />

                <input
                  type="number"
                  placeholder="Online Received"
                  value={paymentOnlineAmount}
                  onChange={(e)=>setPaymentOnlineAmount(e.target.value)}
                  className="w-full border p-2"
                />
              </div>
            )}

            <div className="mb-3 text-sm text-gray-600">
              Less than total is not allowed. Use Pay Later if the full amount is not being received.
            </div>

            <button
              onClick={confirmPayment}
              className="bg-green-600 text-white p-3 w-full rounded"
            >
              Confirm Payment
            </button>

          </div>

        </div>

      )}
      </div>

      </>
  )

}
