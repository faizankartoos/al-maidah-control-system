import { useState, useEffect } from "react";
import api, { buildApiUrl } from "../services/api";
import AreaAutocomplete from "./AreaAutocomplete";
import CustomerPhoneAutocomplete from "./CustomerPhoneAutocomplete";
import { printOrderBill } from "../utils/orderPrinting";
import {
  calculateLoyaltyDiscountAmount,
  formatDeliveryChargeLabel,
  getLoyaltyDiscountPercent,
} from "../utils/orderPricing";

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

function normalizeDeliveryBoys(payload) {
  if (!Array.isArray(payload)) {
    return [];
  }

  return [...payload]
    .filter((boy) => boy && boy.id && boy.name)
    .sort((left, right) =>
      String(left.name).localeCompare(String(right.name), undefined, { sensitivity: "base" })
    );
}

export default function OrdersTab({ externalMode = false }) {
  const inputStyle = `
  w-full bg-slate-600 p-3 rounded text-white
  outline-none border border-slate-700
  focus:border-green-500 focus:ring-2 focus:ring-green-500
  transition-all duration-200
  `
  
  const [toast,setToast] = useState(null)
  const [toastTimerId, setToastTimerId] = useState(null)
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
  const [matchedCustomer, setMatchedCustomer] = useState(null)
  const [applyCustomerAdvance, setApplyCustomerAdvance] = useState(false)
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
  const [showDeliveryChargePrompt,setShowDeliveryChargePrompt] = useState(false)
  const [deliveryChargePromptValue,setDeliveryChargePromptValue] = useState("")
  const [postOrderPrintPrompt, setPostOrderPrintPrompt] = useState(null)

  const [paymentMethod,setPaymentMethod] = useState(null)
  const [amountReceived,setAmountReceived] = useState("")
  const [paymentCashAmount,setPaymentCashAmount] = useState("")
  const [paymentOnlineAmount,setPaymentOnlineAmount] = useState("")
  const [partialPaymentEnabled, setPartialPaymentEnabled] = useState(false)
  const [currentOrderPaymentAmount, setCurrentOrderPaymentAmount] = useState("")
  const [collectPreviousDueEnabled, setCollectPreviousDueEnabled] = useState(false)
  const [collectPreviousDueAmount, setCollectPreviousDueAmount] = useState("")
  const [saveExtraAsAdvance, setSaveExtraAsAdvance] = useState(false)

  useEffect(() => {
    async function loadDeliveryBoys() {
      try {
        const response = await api.get("/ledger/delivery-boys/");
        const normalized = normalizeDeliveryBoys(response.data);

        if (normalized.length) {
          setDeliveryBoys(normalized);
          return;
        }
      } catch (_error) {
        // Fall back to the broader ledger accounts endpoint below.
      }

      try {
        const fallbackResponse = await api.get("/accounts/", {
          params: {
            account_type: "DELIVERY",
            include_inactive: true,
          },
        });
        setDeliveryBoys(normalizeDeliveryBoys(fallbackResponse.data));
      } catch (_error) {
        setDeliveryBoys([]);
      }
    }

    loadDeliveryBoys();

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

  useEffect(() => {
    if(orderType !== "DELIVERY"){
      setDeliveryCharge(0)
      setSelectedDeliveryBoy("")
    }
  }, [orderType])


  function showToast(message,type="success",options = {}){

  if(toastTimerId){
    window.clearTimeout(toastTimerId)
  }

  setToast({message,type,position: options.position || "top-right"})

  const timerId = window.setTimeout(()=>{
    setToast(null)
    setToastTimerId(null)
  },2500)

  setToastTimerId(timerId)

  }

  function handlePhoneMatchChange(customer){
    setMatchedCustomer(customer)

    if(!customer?.has_advance){
      setApplyCustomerAdvance(false)
    }

    if(!(Number(customer?.previous_due_available || 0) > 0)){
      setCollectPreviousDueEnabled(false)
      setCollectPreviousDueAmount("")
    }
  }

  function handleSelectCustomer(customer){
    setMatchedCustomer(customer)

    if(!name.trim() && customer?.name){
      setName(customer.name)
    }

    if(orderType === "DELIVERY"){
      if(!address.trim() && customer?.address){
        setAddress(customer.address)
      }

      if(!selectedAreaId && customer?.area_id){
        setSelectedAreaId(String(customer.area_id))
        setSelectedAreaName(customer.area_name || "")
        setDeliveryCharge(Number(customer.area_delivery_charge || 0))
      }
    }
  }

  function openAmountModalForMethod(method){
    setPaymentMethod(method)
    setAmountReceived(finalPayableAfterAdvance)
    setPaymentCashAmount("")
    setPaymentOnlineAmount("")
    setPartialPaymentEnabled(false)
    setCurrentOrderPaymentAmount(finalPayableAfterAdvance ? String(finalPayableAfterAdvance) : "")
    setCollectPreviousDueEnabled(false)
    setCollectPreviousDueAmount(previousDueAvailable ? String(previousDueAvailable) : "")
    setSaveExtraAsAdvance(false)
    setShowMethodModal(false)
    setShowAmountModal(true)
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

  const discountAmount = Number(discount || 0)
  const deliveryChargeAmount = Number(deliveryCharge || 0)
  const orderHistoryCount = Number(matchedCustomer?.order_count || 0)
  const preDiscountBillAmount = subtotal + deliveryChargeAmount
  const eligibleDiscountPercent = orderHistoryCount >= 3
    ? getLoyaltyDiscountPercent(preDiscountBillAmount)
    : 0
  const eligibleDiscountAmount = orderHistoryCount >= 3
    ? calculateLoyaltyDiscountAmount(preDiscountBillAmount)
    : 0
  const canApplyLoyaltyDiscount = eligibleDiscountAmount > 0
  const total = subtotal - discountAmount + deliveryChargeAmount
  const totalItems = orderItems.reduce((sum,i)=>sum+i.qty,0)
  const shouldShowPhoneField = Boolean(orderType)
  const shouldShowNameField = Boolean(orderType)
  const availableAdvance = Number(matchedCustomer?.advance_available || 0)
  const previousDueAvailable = Number(matchedCustomer?.previous_due_available || 0)
  const appliedAdvancePreview = applyCustomerAdvance ? Math.min(availableAdvance, total) : 0
  const finalPayableAfterAdvance = Math.max(total - appliedAdvancePreview, 0)
  const selectedCurrentOrderAmount = partialPaymentEnabled
    ? Number(currentOrderPaymentAmount || 0)
    : finalPayableAfterAdvance
  const selectedPreviousDueAmount = collectPreviousDueEnabled
    ? Number(collectPreviousDueAmount || 0)
    : 0
  const totalSelectedCollectionAmount = selectedCurrentOrderAmount + selectedPreviousDueAmount
  const extraAdvancePreview = saveExtraAsAdvance
    ? Math.max(Number(amountReceived || 0) - totalSelectedCollectionAmount, 0)
    : 0
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
  setMatchedCustomer(null)
  setApplyCustomerAdvance(false)
  setOrderNote("")
  setRequireAcceptance(false)

  setSelectedDeliveryBoy("")
  setCategorySearch("")

  setOrderItems([])
  setDiscount("")
  setDeliveryCharge("")
  setShowDeliveryChargePrompt(false)
  setDeliveryChargePromptValue("")
  setAmountReceived("")
  setPaymentMethod(null)
  setPaymentCashAmount("")
  setPaymentOnlineAmount("")
  setPartialPaymentEnabled(false)
  setCurrentOrderPaymentAmount("")
  setCollectPreviousDueEnabled(false)
  setCollectPreviousDueAmount("")
  setSaveExtraAsAdvance(false)
  setShowPaymentModal(false)
  setShowMethodModal(false)
  setShowAmountModal(false)
  setPostOrderPrintPrompt(null)

}

  function finishSuccessfulOrder(successMessage){
    showToast(successMessage, "success")
    resetOrderScreen()
  }

  function handleDiscountInput(nextValue){
    const parsedValue = Number(nextValue || 0)

    if(!parsedValue){
      setDiscount("")
      return
    }

    if(!canApplyLoyaltyDiscount){
      showToast("Discount not allowed for this order","warning",{ position: "center" })
      setDiscount("")
      return
    }

    setDiscount(Number(eligibleDiscountAmount.toFixed(2)))
  }

  useEffect(() => {
    if(discountAmount <= 0){
      return
    }

    if(!canApplyLoyaltyDiscount){
      setDiscount("")
      return
    }

    const normalizedDiscount = Number(eligibleDiscountAmount.toFixed(2))

    if(Math.abs(discountAmount - normalizedDiscount) > 0.009){
      setDiscount(normalizedDiscount)
    }
  }, [canApplyLoyaltyDiscount, discountAmount, eligibleDiscountAmount])

  async function handlePrintDecision(shouldPrint){
    if(!postOrderPrintPrompt){
      return
    }

    const promptState = postOrderPrintPrompt
    setPostOrderPrintPrompt(null)

    if(shouldPrint){
      try{
        await printOrderBill(promptState.orderId)
      }catch{
        showToast("Order placed, but printing failed.","warning",{ position: "center" })
      }
    }

    finishSuccessfulOrder(promptState.successMessage)
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
      order_payment_amount: extra.order_payment_amount ?? null,
      collect_previous_due_amount: extra.collect_previous_due_amount ?? 0,
      save_extra_as_advance: extra.save_extra_as_advance ?? false,
      cash_amount: extra.cash_amount ?? 0,
      online_amount: extra.online_amount ?? 0,
      deduct_change: extra.deduct_change ?? false,

      table_number: useCustomTable ? customTable : tableNumber,
      phone:phone,
      name:name,
      address:address,
      area_id: orderType === "DELIVERY" ? selectedAreaId || null : null,
      apply_customer_advance: externalMode && requireAcceptance ? false : applyCustomerAdvance,
      order_note: orderNote.trim() || null,

      discount:discountAmount,
      delivery_charge:deliveryChargeAmount,
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
        const successParts = []
        if(data.acceptance_status === "PENDING"){
          successParts.push("External order submitted for acceptance")
        }else{
          successParts.push("Order placed")
        }

        if(Number(data.advance_applied || 0) > 0){
          successParts.push(`Rs ${formatMoney(data.advance_applied)} adjusted from customer advance`)
        }

        if(Number(data.previous_due_collected || 0) > 0){
          successParts.push(`Rs ${formatMoney(data.previous_due_collected)} collected from previous balance`)
        }

        if(Number(data.advance_saved || 0) > 0){
          successParts.push(`Rs ${formatMoney(data.advance_saved)} saved as customer advance`)
        }

        const successMessage = data.acceptance_status === "PENDING"
          ? "External order submitted for acceptance"
          : successParts.join(". ")

        setPostOrderPrintPrompt({
          orderId: data.order_id,
          successMessage,
        })

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

  if(orderType === "DELIVERY" && !selectedAreaId){
    showToast("Select area for delivery order is required","error",{ position: "center" })
    return
  }

  proceedToPlacementFlow()

  }

  function proceedToPlacementFlow(){

  if(orderType === "DELIVERY"){
    setShowDeliveryModal(true)
    return
  }

  if(finalPayableAfterAdvance <= 0 && previousDueAvailable <= 0){
    submitOrder("PAY_LATER",null,0)
    return
  }

  setShowPaymentModal(true)

  }



  function confirmPayment(){
    const amount = Number(amountReceived)
    const currentOrderAmount = partialPaymentEnabled
      ? Number(currentOrderPaymentAmount || 0)
      : finalPayableAfterAdvance
    const previousDueAmount = collectPreviousDueEnabled
      ? Number(collectPreviousDueAmount || 0)
      : 0

    if(!Number.isFinite(amount) || amount <= 0){
      showToast("Enter a valid received amount","warning")
      return
    }

    if(partialPaymentEnabled){
      if(!phone.trim()){
        showToast("Phone number is required for partial payment orders.","warning",{ position: "center" })
        return
      }

      if(!Number.isFinite(currentOrderAmount) || currentOrderAmount <= 0){
        showToast("Enter a valid current order amount.","warning")
        return
      }

      if(finalPayableAfterAdvance > 0 && currentOrderAmount >= finalPayableAfterAdvance){
        showToast("Partial payment amount must be less than the current payable amount.","warning")
        return
      }
    }

    if(collectPreviousDueEnabled){
      if(!phone.trim()){
        showToast("Phone number is required to collect previous balance.","warning",{ position: "center" })
        return
      }

      if(!Number.isFinite(previousDueAmount) || previousDueAmount <= 0){
        showToast("Enter a valid previous balance amount.","warning")
        return
      }

      if(previousDueAmount - previousDueAvailable > 0.009){
        showToast("Previous balance amount cannot exceed the available due.","warning")
        return
      }
    }

    if(saveExtraAsAdvance && !phone.trim()){
      showToast("Phone number is required to save extra payment as customer advance.","warning",{ position: "center" })
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

    const selectedTotal = currentOrderAmount + previousDueAmount

    if(amount < selectedTotal){
      showToast("Received amount cannot be less than the selected current and previous balance amounts.","warning")
      return
    }

    if(paymentMethod === "ONLINE" && amount > selectedTotal && !saveExtraAsAdvance){
      showToast("Online payment cannot exceed the selected payable amount unless the extra is saved as advance.","warning")
      return
    }

    const changeAmount = saveExtraAsAdvance ? 0 : amount - selectedTotal

    if(paymentMethod === "MIXED" && !saveExtraAsAdvance && changeAmount > cashAmount){
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
      order_payment_amount: currentOrderAmount,
      collect_previous_due_amount: previousDueAmount,
      save_extra_as_advance: saveExtraAsAdvance,
      cash_amount: paymentMethod === "MIXED" ? cashAmount : 0,
      online_amount: paymentMethod === "MIXED" ? onlineAmount : 0,
      deduct_change: changeAmount > 0
    })

  }

        const ToastUI = toast && (
        <div
          className={
            toast.position === "center"
              ? "fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none"
              : "fixed top-6 right-6 z-50"
          }
        >
          <div className={`max-w-sm px-5 py-3 rounded-lg shadow-lg font-semibold text-center
            ${toast.type === "error" ? "bg-red-600 text-white" :
            toast.type === "warning" ? "bg-yellow-500 text-slate-950" :
            "bg-green-600 text-white"}
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

    if(finalPayableAfterAdvance <= 0 && previousDueAvailable <= 0){
      submitOrder("PAY_LATER",null,0)
      return
    }

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

	const DeliveryChargePrompt = showDeliveryChargePrompt && (
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 px-4">

  <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-slate-950 p-6 text-white shadow-[0_24px_60px_rgba(15,23,42,0.45)]">

    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-xs uppercase tracking-[0.28em] text-amber-300">Delivery Charge Check</div>
        <h3 className="mt-2 text-xl font-semibold">Delivery charge is set to Rs 0.00</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Add a delivery charge now, or continue only if this order should be treated as free delivery.
        </p>
      </div>

      <button
        onClick={()=>setShowDeliveryChargePrompt(false)}
        className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
      >
        ✕
      </button>
    </div>

    <div className="mt-5 space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-300">Delivery Charge</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={deliveryChargePromptValue}
          onChange={(e)=>setDeliveryChargePromptValue(e.target.value)}
          placeholder="Enter delivery charge"
          className={inputStyle}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={()=>{
            const parsedValue = Number(deliveryChargePromptValue)

            if(!Number.isFinite(parsedValue) || parsedValue <= 0){
              showToast(
                "Enter a delivery charge above 0 or choose Free Delivery.",
                "warning",
                { position: "center" }
              )
              return
            }

            setDeliveryCharge(parsedValue)
            setShowDeliveryChargePrompt(false)
            setDeliveryChargePromptValue("")
            proceedToPlacementFlow(true)
          }}
          className="rounded-xl bg-amber-500 px-4 py-3 font-semibold text-slate-950 transition hover:brightness-105"
        >
          Apply Delivery Charge
        </button>

        <button
          onClick={()=>{
            setDeliveryCharge(0)
            setShowDeliveryChargePrompt(false)
            setDeliveryChargePromptValue("")
            proceedToPlacementFlow(true)
          }}
          className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 font-semibold text-white transition hover:border-slate-500 hover:bg-slate-800"
        >
          Free Delivery
        </button>
      </div>
    </div>

  </div>

</div>
	)

  const PostOrderPrintPrompt = postOrderPrintPrompt && (
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 px-4">
  <div className="w-full max-w-md rounded-2xl border border-sky-500/30 bg-slate-950 p-6 text-white shadow-[0_24px_60px_rgba(15,23,42,0.45)]">
    <div className="text-xs uppercase tracking-[0.28em] text-sky-300">Print Bill</div>
    <h3 className="mt-2 text-xl font-semibold">Print this bill now?</h3>
    <p className="mt-2 text-sm leading-6 text-slate-300">
      Choose Yes to open the bill instantly, or No to continue with the normal order flow.
    </p>

    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <button
        onClick={()=>handlePrintDecision(true)}
        className="rounded-xl bg-sky-500 px-4 py-3 font-semibold text-slate-950 transition hover:brightness-105"
      >
        Yes, Print Bill
      </button>

      <button
        onClick={()=>handlePrintDecision(false)}
        className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 font-semibold text-white transition hover:border-slate-500 hover:bg-slate-800"
      >
        No
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
      {DeliveryChargePrompt}
      {PostOrderPrintPrompt}

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
                    <CustomerPhoneAutocomplete
                      value={phone}
                      onChange={(nextPhone) => {
                        setPhone(nextPhone)
                      }}
                      onSelectCustomer={handleSelectCustomer}
                      onExactMatchChange={handlePhoneMatchChange}
                      label={orderType === "DINE_IN" ? "Phone Number (Optional)" : "Phone Number"}
                      helperText="Start typing to match an existing customer phone. New numbers still work normally."
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
                          setDeliveryCharge(Number(area.delivery_charge || 0))
	                      }}
	                      onClearArea={() => {
	                        setSelectedAreaId("")
	                        setSelectedAreaName("")
                          setDeliveryCharge(0)
	                      }}
	                      helperText="This is the required delivery zone. The full address below is optional for house, lane, or landmark details."
	                    />
	                  </div>
	                  <div className="md:col-span-2">
	                    <label className="mb-2 block text-sm font-medium text-slate-300">
	                      Delivery Address <span className="text-slate-500">(Optional)</span>
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

    if(!phone){
      showToast("Phone number required for delivery order","warning")
      return false
    }

    if(!selectedAreaId){
      showToast("Select area for delivery order is required","warning",{ position: "center" })
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
    {DeliveryChargePrompt}
    {PostOrderPrintPrompt}

    

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
	                  ? (selectedAreaName ? `${selectedAreaName} • ${address || "Detailed address optional"}` : "Area pending")
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
	                    onChange={(e)=>handleDiscountInput(e.target.value)}
	                    className="w-28 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-right outline-none transition focus:border-emerald-500"
	                  />
	                </div>
                  <div className="text-xs text-slate-400">
                    {!phone.trim()
                      ? "Enter customer phone to check discount eligibility."
                      : orderHistoryCount < 3
                        ? `Discount unlocks after 3 linked orders. Current history: ${orderHistoryCount}.`
                        : !canApplyLoyaltyDiscount
                          ? "This customer is eligible, but the bill must reach Rs 500 for a loyalty discount."
                          : `Eligible loyalty discount: ${eligibleDiscountPercent}% = Rs ${formatMoney(eligibleDiscountAmount)}. Enter any positive value to apply it automatically.`}
                  </div>

	              {orderType === "DELIVERY" && (
	                <div className="flex items-center justify-between gap-3">
	                  <span className="text-sm text-slate-300">Delivery Charge</span>
	                  <div className="w-28 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-right text-sm font-semibold text-emerald-200">
                      {formatDeliveryChargeLabel(orderType, deliveryChargeAmount)}
                    </div>
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

                {matchedCustomer ? (
                  <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-sky-100">
                          Existing customer matched
                        </div>
                        <div className="mt-1 text-sm text-sky-50/85">
                          {matchedCustomer.name || "Customer"} • {matchedCustomer.phone}
                        </div>
                        {matchedCustomer.has_advance ? (
                          <div className="mt-2 text-sm text-emerald-200">
                            Advance available: Rs {formatMoney(matchedCustomer.advance_available)}
                          </div>
                        ) : matchedCustomer.has_outstanding ? (
                          <div className="mt-2 text-sm text-amber-200">
                            Current due in ledger: Rs {formatMoney(matchedCustomer.current_balance)}
                          </div>
                        ) : (
                          <div className="mt-2 text-sm text-slate-300">
                            Existing customer history found. No advance is available right now.
                          </div>
                        )}
                        {previousDueAvailable > 0 ? (
                          <div className="mt-2 text-sm text-amber-100">
                            Previous order-linked due ready to collect: Rs {formatMoney(previousDueAvailable)}
                          </div>
                        ) : null}
                      </div>

                      {matchedCustomer.has_advance ? (
                        <label className="inline-flex cursor-pointer items-center gap-3 rounded-2xl border border-emerald-500/20 bg-slate-950/40 px-4 py-3 text-sm font-medium text-slate-100">
                          <input
                            type="checkbox"
                            checked={applyCustomerAdvance && !(externalMode && requireAcceptance)}
                            disabled={externalMode && requireAcceptance}
                            onChange={(event)=>setApplyCustomerAdvance(event.target.checked)}
                            className="h-4 w-4 accent-emerald-500"
                          />
                          Adjust Advance
                        </label>
                      ) : null}
                    </div>

                    {matchedCustomer.has_advance ? (
                      <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
                        {externalMode && requireAcceptance
                          ? "Advance adjustment stays disabled while Require Acceptance is on, so no financial value is applied before the order is accepted."
                          : applyCustomerAdvance
                            ? `This order will auto-adjust Rs ${formatMoney(appliedAdvancePreview)} from the customer's advance. New payable amount: Rs ${formatMoney(finalPayableAfterAdvance)}.`
                            : "You can leave advance unchecked if the staff does not want to use customer advance on this order."}
                      </div>
                    ) : null}
                  </div>
                ) : null}

	              <div className="rounded-2xl bg-gradient-to-r from-emerald-500 to-green-500 p-4 text-white shadow-lg shadow-emerald-900/30">
	                <div className="flex items-center justify-between text-sm uppercase tracking-[0.25em] text-emerald-50/80">
	                  <span>Total</span>
	                  <span>{totalItems} items</span>
	                </div>
	                <div className="mt-2 text-3xl font-semibold">Rs {formatMoney(total)}</div>
	                <div className="mt-1 text-sm text-emerald-50/90">Subtotal Rs {formatMoney(subtotal)}</div>
                  {applyCustomerAdvance && appliedAdvancePreview > 0 ? (
                    <div className="mt-2 text-sm font-medium text-emerald-50">
                      Advance adjusted: Rs {formatMoney(appliedAdvancePreview)} • Payable now: Rs {formatMoney(finalPayableAfterAdvance)}
                    </div>
                  ) : null}
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
              onClick={()=>openAmountModalForMethod("CASH")}
              className="block w-full bg-gray-700 text-white p-3 rounded mb-3"
            >
              CASH
            </button>

            <button
              onClick={()=>openAmountModalForMethod("ONLINE")}
              className="block w-full bg-blue-600 text-white p-3 rounded"
            >
              ONLINE
            </button>

            <button
              onClick={()=>openAmountModalForMethod("MIXED")}
              className="block w-full bg-emerald-600 text-white p-3 rounded mt-3"
            >
              MIXED
            </button>

          </div>

        </div>

      )}



      {showAmountModal && (

        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-70 px-4">

          <div className="w-full max-w-lg rounded-3xl bg-white p-6 text-black shadow-[0_28px_80px_rgba(15,23,42,0.28)]">

            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Payment Setup</div>
                <div className="mt-2 text-xl font-semibold text-slate-900">
                  Current order payable: ₹{formatMoney(finalPayableAfterAdvance)}
                </div>
                {previousDueAvailable > 0 ? (
                  <div className="mt-1 text-sm text-amber-700">
                    Previous customer due available: ₹{formatMoney(previousDueAvailable)}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setShowAmountModal(false)}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
              >
                Close
              </button>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setPartialPaymentEnabled((current) => {
                    const nextValue = !current
                    if (!nextValue) {
                      setCurrentOrderPaymentAmount(String(finalPayableAfterAdvance || ""))
                    }
                    return nextValue
                  })
                }}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  partialPaymentEnabled
                    ? "bg-amber-500 text-slate-950"
                    : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                Partial Payment
              </button>

              <button
                type="button"
                onClick={() => setSaveExtraAsAdvance((current) => !current)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  saveExtraAsAdvance
                    ? "bg-emerald-500 text-slate-950"
                    : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                Excessive Payment
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Amount Received</label>
                <input
                  type="number"
                  placeholder="Amount Received"
                  value={amountReceived}
                  onChange={(e)=>setAmountReceived(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 p-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              {partialPaymentEnabled ? (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Current Order Amount</label>
                  <input
                    type="number"
                    placeholder="How much is being paid for this order now?"
                    value={currentOrderPaymentAmount}
                    onChange={(e)=>setCurrentOrderPaymentAmount(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 p-3 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30"
                  />
                  <div className="mt-2 text-xs text-slate-500">
                    Use this when the customer is paying only part of the current order. The remaining amount will move to customer ledger immediately.
                  </div>
                </div>
              ) : null}

              {previousDueAvailable > 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <label className="flex items-center gap-3 text-sm font-medium text-slate-800">
                    <input
                      type="checkbox"
                      checked={collectPreviousDueEnabled}
                      onChange={(e)=>{
                        const checked = e.target.checked
                        setCollectPreviousDueEnabled(checked)
                        if(checked && !collectPreviousDueAmount){
                          setCollectPreviousDueAmount(String(previousDueAvailable))
                        }
                      }}
                    />
                    Collect previous pending balance too
                  </label>

                  {collectPreviousDueEnabled ? (
                    <div className="mt-3">
                      <input
                        type="number"
                        placeholder="Previous due amount"
                        value={collectPreviousDueAmount}
                        onChange={(e)=>setCollectPreviousDueAmount(e.target.value)}
                        className="w-full rounded-2xl border border-amber-200 p-3 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {paymentMethod === "MIXED" && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    type="number"
                    placeholder="Cash Received"
                    value={paymentCashAmount}
                    onChange={(e)=>setPaymentCashAmount(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 p-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
                  />

                  <input
                    type="number"
                    placeholder="Online Received"
                    value={paymentOnlineAmount}
                    onChange={(e)=>setPaymentOnlineAmount(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 p-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <div>Current order allocation: ₹{formatMoney(selectedCurrentOrderAmount)}</div>
                <div className="mt-1">Previous balance allocation: ₹{formatMoney(selectedPreviousDueAmount)}</div>
                <div className="mt-1">Total selected allocation: ₹{formatMoney(totalSelectedCollectionAmount)}</div>
                {saveExtraAsAdvance ? (
                  <div className="mt-1 text-emerald-700">
                    Any extra above the selected allocation will be saved as customer advance. Preview: ₹{formatMoney(extraAdvancePreview)}
                  </div>
                ) : (
                  <div className="mt-1 text-slate-500">
                    Any extra above the selected allocation will be treated as change and confirmed before saving.
                  </div>
                )}
              </div>

              <button
                onClick={confirmPayment}
                className="w-full rounded-2xl bg-green-600 p-3 font-semibold text-white transition hover:bg-green-500"
              >
                Confirm Payment
              </button>
            </div>

          </div>

        </div>

      )}
      </div>

      </>
  )

}
