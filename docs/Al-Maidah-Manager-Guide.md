# Al-Maidah Control System

Manager Training Guide

Version: April 1, 2026

This guide is written for a complete beginner. You do not need any programming knowledge to use this system.

---

## Introduction

The Al-Maidah Control System is the main operating panel for the restaurant.

It helps you manage:

- menu items
- new orders
- live order handling
- inventory
- customer and delivery balances
- expenses
- business reports
- staff access

Think of the system like this:

- `Menu` tells the system what you sell
- `Orders` is where new orders are placed
- `Manage Orders` is where live orders are controlled
- `Inventory` tells you what stock you have
- `Ledger` tracks dues, collections, and money movement
- `Expenses` records business spending
- `Reports` brings everything together for business review
- `Access` controls who can log in and what they can see

---

## What These Addresses Mean

If you are running the system on your own computer, you may see addresses like these:

- `http://localhost:5173/`
- `http://localhost:5173/display`

Here is what they mean:

- `http://localhost:5173/`
  This is the main control panel. Managers and staff use this address to log in and work.

- `http://localhost:5173/display`
  This is the customer display screen. It is meant to be shown on a second screen or TV so customers can see order progress and ready orders.

Important:

- `localhost` means “this same computer”
- on your deployed system, these addresses may be replaced by your real server address or domain
- the meaning stays the same:
  one address for the main app, and one address for the customer display

---

## First Things First

When you open the main control panel:

1. You will see the login page.
2. Enter your username and password.
3. After a successful login, the system shows a welcome animation.
4. Then the main dashboard opens with the tabs you are allowed to use.

At the top right of the system you also have:

- `Theme` switch: change between Night and Day mode
- `Font` size: Small, Medium, Big
- `Logout`: exit the system safely

Your theme and font settings are saved to your own account.

---

## Roles In The System

There are only two kinds of accounts:

- `Admin`
- `Staff`

### Admin

Admin has full access to the whole system.

Admin can:

- use every tab
- create staff logins
- edit staff access
- delete staff accounts
- decide which tabs a staff member can open
- decide whether a staff member is allowed to collect payments

### Staff

Staff can only see the tabs that the admin has allowed.

Some staff may be able to open `Manage Orders` but still may not be allowed to use the `Collect` button. That permission is controlled separately.

---

## Main Tabs In The App

The system can contain these tabs:

- `Menu`
- `Orders`
- `Manage Orders`
- `Inventory`
- `Ledger`
- `Expenses`
- `Reports`
- `Access`

If a staff account cannot see a tab, it usually means the admin has not granted that access yet.

---

## Menu Tab

### What The Menu Tab Is For

The `Menu` tab is where you create and manage the food and drink items that can be sold.

This is the list used by the cashier while placing orders.

### What You Can Do In Menu

- create a new menu item
- give it a name, category, and price
- mark it available or unavailable
- edit an existing item
- delete an item
- search and filter the list

### How To Add A Menu Item

1. Open `Menu`
2. In the `Create Menu Item` section, fill:
   - name
   - category
   - price
   - availability
3. Click the save button

Example:

- Name: Chicken Burger
- Category: Burgers
- Price: 180
- Available: Yes

### How To Edit A Menu Item

1. Open `Menu List`
2. Find the item
3. Click `Edit`
4. Change the values
5. Save

### How To Temporarily Hide An Item

If an item is not available today, do not delete it.

Instead:

1. Find the item in `Menu List`
2. Use the availability button near `Edit`
3. Make it unavailable

What happens:

- it disappears from the ordering screen
- you can bring it back later

### How To Delete An Item

Delete only if you are sure the item should not exist anymore.

Steps:

1. Find the item
2. Click `Delete`
3. Confirm

### Good Practice

- use clear names
- keep categories clean and consistent
- hide unavailable items instead of deleting them

---

## Orders Tab

### What The Orders Tab Is For

The `Orders` tab is where new orders are created.

This is the cashier or counter screen.

### Order Types

The system supports three order types:

- `Dine In`
- `Takeaway`
- `Delivery`

### Main Flow Of Placing An Order

1. Choose order type
2. Fill order details
3. Decide whether it is live or scheduled
4. Continue to the order screen
5. Add menu items
6. Add discount, delivery charge, and note if needed
7. Choose payment flow
8. Place the order

### Dine In Order

For dine-in:

- select a table
- or enter a custom table name
- customer name is optional
- phone is usually not required unless the order is scheduled

### Takeaway Order

For takeaway:

- phone number is required
- customer name can be entered
- no delivery address is needed

### Delivery Order

For delivery:

- phone number is required
- delivery address is required
- a delivery boy must be assigned
- delivery charge can be added if needed

### Scheduled Order

Any of the three order types can be scheduled:

- dine in
- takeaway
- delivery

When scheduling:

- phone number is required
- choose date and time
- for scheduled dine-in, you may also enter guest count

What a scheduled order means:

- it is created now
- it does not go into the live kitchen queue immediately
- it waits in scheduled state
- later it is started from `Manage Orders`

### How To Add Items To The Order

1. Use category buttons on the left
2. Search for an item if needed
3. Click `Add` on the menu item
4. Use the order summary on the right to review quantities

### Order Summary Area

This area helps you:

- review selected items
- remove items
- add discount
- add delivery charge
- write an order note
- see total amount before placing the order

### Order Note

Use `Order Note` for special instructions like:

- less spicy
- no onion
- urgent order
- send ketchup

### Payment Options

There are two main paths:

- `Pay Now`
- `Pay Later`

#### Pay Now

If the customer is paying immediately, the system allows:

- cash
- online
- mixed payment

Important rule:

- the system does not allow less than the total bill amount
- if full amount is not being received, use `Pay Later`

#### Pay Later

Use this when the customer is not paying right now.

What happens:

- the order is created as unpaid
- later the amount can be collected from `Manage Orders`
- depending on the flow, ledger records may also be created later

### Mixed Payment

Mixed payment means part cash and part online.

Example:

- total bill: 500
- cash: 200
- online: 300

### Extra Cash / Change Confirmation

If the customer gives more cash than the bill:

- the system asks for confirmation before deducting the change from the cash drawer

### Before You Click Place Order

Always check:

- order type
- table or address
- phone number if needed
- items
- total amount
- payment method
- delivery boy for delivery
- scheduled time if it is a scheduled order

---

## Manage Orders Tab

### What The Manage Orders Tab Is For

`Manage Orders` is the live control room for all orders after they are created.

This is where the manager watches and controls order progress.

### What You Can Do In Manage Orders

- search orders
- filter orders
- open order details
- update an order
- start a scheduled order
- mark an order ready
- complete an order
- collect unpaid money
- cancel an order
- print a bill

### Search And Filters

You can search by:

- order id
- customer details

You can filter by:

- processing
- ready
- completed
- cancelled
- paid
- unpaid
- scheduled
- dine in
- takeaway
- delivery
- date range

For delivery you can also:

- filter by delivery boy
- exclude address text for easier routing checks

### Understanding The Order Row

Each order row shows:

- order number
- order type
- quick locator text
- time
- status
- payment status
- payment mode
- remaining amount
- total amount
- action buttons

### View

Click `View` to open the full order details.

Inside the detail view you can see:

- overview
- customer information
- location information
- totals
- note
- line items
- payment history

### Update

`Update` is available for processing orders.

Use it when you need to change:

- order type
- customer name
- phone number
- table
- delivery boy
- delivery address
- delivery charge
- discount
- order note
- order items

Good examples:

- customer changed table
- takeaway became delivery
- wrong item was added
- delivery address needs correction

### Start Scheduled Order

If an order is scheduled, use:

- `Start Scheduled Order`

What happens:

- scheduled order becomes live
- it enters the active order flow
- if it is a pay-later delivery order, delivery-boy balance handling starts from this point

### Ready

Use `Ready` when the order is prepared and ready for handover, pickup, or service.

What happens:

- order moves from `PROCESSING` to `READY`
- customer display can show it
- ready sound can play on the display screen

### Complete

Use `Complete` only after the order is actually finished from an operational point of view.

Important:

- `Ready` means food is ready
- `Complete` means the order is operationally closed

For unpaid orders, `Complete` may also ask for customer details if needed so the ledger can track the due amount properly.

### Collect

Use `Collect` when the payment is being received later.

Possible methods:

- cash
- online
- mixed

Important:

- full remaining payment is required
- underpayment is not allowed
- only users with collect permission can use this button

If a user does not have collect permission:

- the system shows `Collect (Locked)`
- clicking it shows a lock warning

### Cancel

Use `Cancel` for orders that will not continue.

During cancellation, the system asks:

- was the order cooked or not cooked
- if the order was already paid, was it refunded or not
- refund amount, if refunded

This matters because:

- cooked cancelled orders affect wastage review
- refunded cancelled orders affect finance

### Print

Use `Print` to print the order bill or kitchen-style slip based on your setup.

### Safe Daily Rule

Most daily order work follows this pattern:

- create order in `Orders`
- control progress in `Manage Orders`
- collect later here if unpaid
- use `View` whenever you need clarity

---

## Inventory Tab

### What Inventory Means In This System

Inventory is handled manually and independently.

This means:

- inventory is not automatically reduced from orders
- stock leaves inventory only when you log it manually
- reports use this logged stock movement later

In this system there is an important difference:

- `Product` means the item exists in your business
- `Inventory` means that item currently has stock history / stock balance

So an item can exist in the system even if stock is zero.

### What You Can Do In Inventory

- create raw inventory items
- set low stock threshold
- add stock through draft bills
- confirm bills to move stock into live inventory
- stock out items
- manually adjust stock
- review current snapshot
- check recent stock out log
- review full inventory history

### Create New Item

Use `Create New Item` to add raw materials like:

- rice
- oil
- chicken
- spices
- packaging material

You can also set:

- unit
- low-stock warning level

### Stock Entry Workspace

This is where stock is added into inventory.

The flow is:

1. start a draft bill
2. add one or many items to that bill
3. review the bill
4. confirm the bill

Why this is useful:

- it keeps purchase history
- it shows which items came in together
- it preserves bill information for future review

### Open Draft Bills

If a bill is not finished:

- it stays in draft
- you can reopen it
- page refresh does not destroy it

### Quick Add Stock

From `Current Inventory Snapshot`, you can click `Add Stock`.

This opens a faster stock-entry flow for that specific item and starts a new bill with that item prefilled.

### Quick Stock Out

Use `Quick Stock Out` when stock leaves the inventory.

Examples:

- used in kitchen
- damaged
- expired
- wastage
- sample
- other

What happens:

- stock reduces immediately
- a stock-out log is created

### Low Stock Alerts

This tells you what needs attention.

Important:

- items with zero stock can still appear here if they exist as products and have a low-stock threshold
- this is useful as a purchase reminder list

### Manual Stock Adjustment

Use this only for corrections.

Examples:

- opening balance fix
- count mismatch
- old damage was never logged

Do not use manual adjustment for normal daily stock issue. Use stock out for that.

### Current Inventory Snapshot

This is your live stock view.

It helps you see:

- what is currently in stock
- quantity
- value
- quick add stock action
- quick stock out action

### Recent Stock Out Log

This shows the latest outgoing stock movements.

Use it to answer:

- what left inventory recently
- how much left
- why it left

### Inventory History

This is the combined history of:

- stock in
- stock out
- manual adjustments

### Good Inventory Practice

- create every item once, even if current quantity is zero
- set thresholds carefully
- use stock out honestly and regularly
- confirm bills only after checking the quantities and prices

---

## Ledger Tab

### What Ledger Is For

Ledger is the money and dues tracking section.

It helps you answer:

- who owes the restaurant money
- which rider is holding delivery money
- what the cash drawer looks like
- what transactions happened

### Main Areas In Ledger

Ledger has three working sections:

- `Accounts`
- `Transactions`
- `Daily Report`

### Account Types

You can create these account types:

- customer
- delivery boy
- vendor

The cash drawer itself is system-managed.

### Accounts Section

In `Accounts`, you can:

- create accounts
- search accounts
- filter by account type
- open account details
- collect from customer accounts

### Create Account

Use this when you need a formal ledger record for a person.

Examples:

- regular customer who buys on due
- delivery boy
- vendor

You can enter:

- name
- account type
- phone
- address
- opening balance

### Open Account Details

Click into an account when you need:

- current balance
- opening balance
- total credits
- total debits
- transaction history
- linked order information

### Manual Collection

Use collection for customer accounts when a due amount is being paid back.

Possible collection types:

- cash
- online

What happens:

- customer balance reduces
- ledger updates

### Transactions Section

Use `Transactions` when you want to search the overall money history.

You can filter by:

- search
- account
- account type
- entry type
- payment type
- start date
- end date

### Daily Report Section

This gives a quick daily money picture.

It helps you see:

- cash drawer balance
- order collections today
- manual collections today
- customer outstanding
- delivery pending

### Good Ledger Practice

- create proper accounts for regular due customers
- use collection only when money is actually received
- do not treat ledger as inventory or expense storage

---

## Expenses Tab

### What Expenses Is For

Expenses is a manual business-cost log.

It is independent from the ledger and inventory.

That means:

- you record expenses here
- later reports use these numbers
- expenses do not automatically deduct from the cash drawer in this setup

### What You Can Do In Expenses

- create categories
- record expenses
- filter expense history
- review totals
- reuse old entries as templates

### Expense Categories

Use categories like:

- electricity
- rent
- salary
- packaging
- maintenance
- transport
- cleaning

Categories can be:

- active
- inactive

Inactive categories stay in history but cannot be used for new expenses.

### Record An Expense

To record an expense, fill:

- category
- amount
- payment mode
- date
- description
- reference id if any

### Payment Modes

Examples:

- cash
- UPI
- card
- bank

### Use Again

If a similar expense happens often:

- use the repeat / template style option
- it pre-fills the form
- then adjust the date or amount and save

### Filters

You can filter expenses by:

- search
- category
- payment mode
- date range

### Good Expense Practice

- always write a clear description
- use reference number when there is a bill or proof
- keep categories consistent

---

## Reports Tab

### What Reports Is For

Reports is the business review tab.

This is the place where you study:

- revenue
- stock-out value
- expenses
- profit
- refunds
- cancellations
- low stock
- unpaid money

### Very Important Concept

Reports in this system depend on honest manual logging.

For example:

- inventory is counted from manual stock entries and stock-outs
- expenses are counted from manual expense logs

So reports are powerful, but they depend on correct daily use.

### Start With Date Controls

At the top of reports, use:

- quick presets like today, last 7 days, this month
- or custom start and end date

Then click:

- `Generate Reports`

### What You Can See In Reports

- gross revenue
- COGS
- expenses
- average order value
- cash drawer snapshot
- customer outstanding
- delivery pending
- open unpaid total

### Useful Charts

The reports screen includes charts such as:

- daily money flow
- sales by order type
- collection mix
- expense categories
- live order status
- stock-out reasons

### Useful Detailed Sections

You can also review:

- top selling items
- low stock watchlist
- upcoming scheduled orders
- open unpaid orders
- recent completed orders
- recent expenses
- cancelled orders and wastage
- inventory by value

### What Reports Can Answer

Examples:

- what was revenue this week
- what were expenses this month
- which category consumed the most money
- what stock value went out during a date range
- which customers still owe money
- how much money is still with delivery boys
- which items are low in stock

### Current Limitation To Remember

Reports currently shows stock-out totals and reasons well, but if you want a long full item-by-item stock-out register for any date range, that is something to improve further later.

---

## Access Tab

### What Access Is For

`Access` is the login and permissions control center.

Only admin should manage this tab.

### What You Can Do In Access

- create logins
- edit logins
- activate or deactivate users
- choose staff role
- choose visible tabs
- choose special access
- delete accounts

### Special Permission: Collect Payments

This is important.

A staff user may have:

- access to `Manage Orders`

but still may not have:

- permission to use `Collect`

This is controlled separately for financial safety.

### When To Create Staff Accounts

Create staff accounts when:

- you want each person to log in with their own account
- you want limited access
- you want better control over who can do what

### Good Access Practice

- give only the tabs a person actually needs
- restrict `Collect Payments` unless truly required
- do not share admin login casually

---

## Customer Display

### What The Display Screen Does

The customer display is meant for a public screen.

It shows:

- live processing orders
- ready orders
- ready sound on supported browsers and devices

### Address

Local development example:

- `http://localhost:5173/display`

On deployment, it becomes your live display address with `/display`.

### Good Use

- open it on a second screen or TV
- keep it visible to customers or front-desk staff
- use it to reduce shouting and confusion around ready orders

---

## Recommended Daily Workflow For A Manager

### Before Opening

1. Log in
2. Check `Menu` availability
3. Check `Inventory` low stock alerts
4. Review `Reports` or `Ledger` if needed

### During Service

1. Place new orders in `Orders`
2. Control them in `Manage Orders`
3. Use `Ready` and `Complete` properly
4. Use `Collect` for later payments only when money is received
5. Record stock-outs honestly in `Inventory`
6. Record expenses in `Expenses`

### End Of Day

1. Check `Manage Orders` for unpaid or unfinished orders
2. Review `Ledger`
3. Review `Expenses`
4. Open `Reports`
5. Check:
   - revenue
   - expenses
   - refunds
   - wastage
   - low stock
   - outstanding dues

---

## Common Mistakes To Avoid

- deleting menu items when you only need to make them unavailable
- forgetting to assign a delivery boy for delivery orders
- using `Complete` too early
- collecting money before it is actually received
- using manual stock adjustment for normal stock usage
- forgetting to record stock-out
- recording expenses without clear descriptions
- giving collect access to everyone

---

## Quick Definitions

- `Live Order`: immediate order
- `Scheduled Order`: future order waiting to be started
- `Ready`: prepared and ready
- `Complete`: operationally closed
- `Pay Later`: unpaid order to be collected later
- `COGS`: stock value that left inventory
- `Low Stock Threshold`: warning level for an inventory item
- `Ledger`: due and money movement tracking

---

## Final Advice For A New Manager

Do not try to learn everything in one sitting.

Learn in this order:

1. Login and basic navigation
2. Menu
3. Orders
4. Manage Orders
5. Inventory
6. Expenses
7. Ledger
8. Reports
9. Access

If you understand `Orders`, `Manage Orders`, `Inventory`, and `Expenses`, you can already run most of the restaurant smoothly.

The rest helps you review, control, and improve the business.
