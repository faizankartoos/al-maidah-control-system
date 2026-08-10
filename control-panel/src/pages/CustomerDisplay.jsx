// import { useEffect, useState, useRef } from "react";

// export default function CustomerDisplay() {

// const [orders,setOrders] = useState([])
// const previousOrders = useRef([])
// const [time,setTime] = useState(new Date())
// const [tick,setTick] = useState(0)
// useEffect(()=>{

// const interval = setInterval(()=>{
// setTick(t=>t+1)
// },1000)

// return ()=>clearInterval(interval)

// },[])
// useEffect(()=>{

// const clock = setInterval(()=>{
// setTime(new Date())
// },1000)

// return ()=>clearInterval(clock)

// },[])

// useEffect(()=>{

// fetchOrders()

// const interval = setInterval(fetchOrders,3000)

// return ()=>clearInterval(interval)

// },[])

// async function fetchOrders(){

// try{

// const res = await fetch("http://localhost:8000/api/orders/display/")
// const data = await res.json()

// detectReadyOrders(data)

// setOrders(data)

// previousOrders.current = data

// }catch(err){

// console.error("Display fetch failed")

// }

// }

// function detectReadyOrders(newOrders){

// newOrders.forEach(order=>{

// const old = previousOrders.current.find(o=>o.id===order.id)

// if(old && old.status !== "COMPLETED" && order.status === "COMPLETED"){

// const audio = new Audio("/order-ready.mp3")
// audio.play()

// }

// })

// }

// function getProgress(createdAt, status){

// if(status === "COMPLETED"){
// return 100
// }

// const created = new Date(createdAt)
// const now = new Date()

// const elapsedSeconds = (now - created) / 1000

// const maxSeconds = 35 * 60

// let progress = (elapsedSeconds / maxSeconds) * 100

// if(progress > 100){
// progress = 100
// }

// return progress
// }

// function getStatusColor(status){

// if(status==="PROCESSING") return "bg-blue-500"
// if(status==="COMPLETED") return "bg-green-500"
// if(status==="CANCELLED") return "bg-red-500"

// return "bg-gray-500"

// }

// function rowSize(){

// if(orders.length <= 4) return "text-4xl py-8"
// if(orders.length <= 8) return "text-3xl py-6"

// return "text-2xl py-4"

// }

// return(

// <div
// className="min-h-screen text-white flex flex-col items-center"
// style={{
// backgroundImage:"url('/display-bg.png')",
// backgroundSize:"contain",
// backgroundRepeat:"no-repeat",
// backgroundPosition:"center",
// backgroundColor:"#00563b"
// }}
// >

// {/* overlay for readability */}

// <div className="absolute inset-0 bg-black/70 opacity-70"></div>

// <div className="relative w-full max-w-[90vw] px-4 py-8">

// {/* header */}

// <div className="flex justify-between items-center mb-10">

// <h1 className="text-5xl font-bold tracking-widest">
// LIVE ORDER STATUS
// </h1>

// <div className="text-3xl font-mono">
// {time.toLocaleTimeString()}
// </div>

// </div>

// {/* table */}

// <div className="grid grid-cols-[1fr_1fr_2fr_1.5fr_1fr] gap-6 text-gray-300 text-lg font-bold mb-6 px-6">

// <div>Order ID</div>
// <div>Table</div>
// <div className="text-center">Progress</div>
// <div className="ml-20">Status</div>
// <div>Amount</div>

// </div>

// {/* orders */}

// <div className="space-y-4">

// {orders.map(order=>{

// const progress = getProgress(order.created_at)

// return(

// <div
// key={order.id}
// className={`grid grid-cols-[1fr_1fr_2fr_1.5fr_1fr] gap-6 items-center bg-gray-900 bg-opacity-70 rounded-xl px-6 ${rowSize()} transition-all duration-500`}
// >

// <div className="text-xxl font-bold text-yellow-400">
// #{order.id}
// </div>

// <div className="text-xxl text-gray-100">
// {order.table || "-"}
// </div>

// <div>

// <div className="w-full bg-gray-700 rounded-full h-6 overflow-hidden">

// <div className="w-full bg-gray-700 rounded-full h-6 overflow-hidden">

// <div className="w-full bg-gray-800 rounded-full h-7 overflow-hidden shadow-inner">


// <div className="w-full bg-gray-800 rounded-full h-7 overflow-hidden shadow-inner">

//   <div
//     className="h-full transition-all duration-1000 ease-out overflow-hidden"
//     style={{ width: `${progress}%` }}
//   >

//     <div className="progress-liquid h-full w-full"></div>

//   </div>

// </div>



// </div>

// </div>

// </div>

// </div>

// <div>

// <span className={`px-4 py-2 rounded-full ${getStatusColor(order.status)}`}>
// {order.status}
// </span>

// </div>

// <div className="font-bold text-green-400">

// ₹{order.amount}

// </div>

// </div>

// )

// })}

// </div>

// </div>

// </div>

// )

// }

import { useEffect, useState, useRef } from "react";

export default function CustomerDisplay() {

const [orders,setOrders] = useState([])
const previousOrders = useRef([])
const readyTimes = useRef({})
const readyAudio = useRef(null)

async function playReadySound(){

const audio = readyAudio.current

if(!audio){
  return
}

try{

audio.pause()
audio.currentTime = 0
audio.volume = 1

await audio.play()

}catch(err){
// Some browsers block autoplay without user interaction.
// We fail quietly so displays that permit autoplay keep working
// without showing any manual enable UI.

}

}

useEffect(()=>{

const audio = new Audio("/order-ready.mp3")
audio.preload = "auto"
audio.load()
readyAudio.current = audio

return ()=>{
  if(readyAudio.current){
    readyAudio.current.pause()
    readyAudio.current = null
  }
}

},[])

useEffect(()=>{

fetchOrders()

const interval = setInterval(fetchOrders,3000)

return ()=>clearInterval(interval)

},[])


function detectReadyOrders(newOrders){

const now = Date.now()
let shouldPlaySound = false

newOrders.forEach(order=>{

const old = previousOrders.current.find(o=>o.id===order.id)

if(old && old.status !== "READY" && order.status === "READY"){

shouldPlaySound = true
readyTimes.current[order.id] = now

}

})

if(shouldPlaySound){
  playReadySound()
}

}



async function fetchOrders(){

try{

const res = await fetch("http://localhost:8000/api/orders/display/")
const data = await res.json()

detectReadyOrders(data)

const now = Date.now()

const filtered = data.filter(order => {

const created = new Date(order.created_at).getTime()

// Remove orders older than 2 hours
if(now - created > 7200000){
  return false
}

// Only allow processing orders
if(order.status === "PROCESSING"){
  return true
}

if(order.status !== "READY"){
  return false
}

let readyTime = readyTimes.current[order.id]

if(!readyTime){
  readyTimes.current[order.id] = now
  readyTime = now
}

return now - readyTime < 60000

})

setOrders(filtered)

previousOrders.current = data

}catch(err){

console.error("Display fetch failed")

}

}





function getProgress(createdAt,status){

if(status==="READY") return 100

const created = new Date(createdAt)
const now = new Date()

const elapsedSeconds = (now-created)/1000

const maxSeconds = 35*60

let progress = (elapsedSeconds/maxSeconds)*100

if(progress>100) progress=100

return progress

}



function splitOrders(){

const midpoint = Math.ceil(orders.length/2)

const left = orders.slice(0,midpoint)
const right = orders.slice(midpoint)

return {left,right}

}

const {left,right} = splitOrders()

function orderTypeLabel(orderType){
  if(orderType === "DINE_IN") return "DINE-IN"
  if(orderType === "TAKEAWAY") return "TAKEAWAY"
  if(orderType === "DELIVERY") return "DELIVERY"
  return orderType || "ORDER"
}

function orderTypeBadgeClasses(orderType){
  if(orderType === "DINE_IN") return "bg-amber-100 text-amber-900 border-amber-300"
  if(orderType === "TAKEAWAY") return "bg-sky-100 text-sky-900 border-sky-300"
  if(orderType === "DELIVERY") return "bg-rose-100 text-rose-900 border-rose-300"
  return "bg-slate-100 text-slate-900 border-slate-300"
}



function ProgressBar({order}){

const progress = getProgress(order.created_at,order.status)
const isReady = order.status==="READY"

const textColor = isReady ? "#000000" : (progress > 50 ? "#ffffff" : "#000000")

return(

<div className="w-full h-12 rounded-full overflow-hidden relative">

{/* BAR LAYER */}

<div
className={`absolute left-0 top-0 h-full ${isReady ? "ready-collapse" : ""}`}
style={{
width:`${progress}%`,
backgroundColor: isReady ? "#e6b800" : "#01553b"
}}
>

{!isReady && (
<div className="progress-liquid h-full w-full"></div>
)}

</div>

{/* TEXT LAYER */}

<div
className={`absolute inset-0 flex items-center justify-center font-bold text-xl ${isReady ? "ready-text" : ""}`}
style={{color:textColor}}
>

{isReady ? "READY!" : "PROCESSING"}

</div>

</div>

)

}



function Row({order}){

return(

<div className="grid grid-cols-[1.08fr_1.92fr] items-center gap-4 border-b border-gray-200 py-5 px-6">

<div>

<div
className={`inline-flex rounded-full border px-4 py-1 text-lg font-extrabold tracking-[0.22em] ${orderTypeBadgeClasses(order.order_type)}`}
>
{orderTypeLabel(order.order_type)}
</div>

<div className="mt-3 text-6xl font-bold text-black">
{order.id}
</div>

</div>

<ProgressBar order={order}/>

</div>

)

}



return(

<div className="w-screen h-screen flex flex-col bg-white overflow-hidden">


{/* HEADER IMAGE */}

<img
  src="/display-bg.png"
  className="w-full h-auto"
/>



{/* COLUMN HEADER BAR */}

<div
className="grid grid-cols-4 text-white font-bold text-3xl items-center text-center border-b-4 border-gray-800"
style={{backgroundColor:"#01553b",height:"70px"}}
>

<div>ORDER</div>

<div>STATUS</div>

<div>ORDER</div>

<div>STATUS</div>

</div>



{/* ORDERS AREA */}

<div className="flex flex-1 relative">


{/* LEFT SIDE */}

<div className="w-1/2">

{left.map(order=>(
<Row key={order.id} order={order}/>
))}

</div>



{/* CENTER DIVIDER */}

<div className="absolute left-1/2 top-0 bottom-0 w-[3px] bg-gray-400"></div>



{/* RIGHT SIDE */}

<div className="w-1/2">

{right.map(order=>(
<Row key={order.id} order={order}/>
))}

</div>


</div>

</div>

)

}
