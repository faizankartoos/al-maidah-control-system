import MenuTab from "../components/MenuTab";
import CreateOrderTab from "../components/CreateOrderTab";
import ManageOrdersTab from "../components/ManageOrdersTab";
import SettingsTab from "../components/SettingsTab";
import InventoryTab from "../components/InventoryTab";
import LedgerTab from "../components/LedgerTab";
import ExpensesTab from "../components/ExpensesTab";
import ReportsTab from "../components/ReportsTab";
import DataTab from "../components/DataTab";
import UserManagementTab from "../components/UserManagementTab";


export const TAB_DEFINITIONS = [
  {
    key: "MENU",
    label: "Menu",
    component: MenuTab,
  },
  {
    key: "ORDERS",
    label: "Orders",
    component: CreateOrderTab,
  },
  {
    key: "MANAGE_ORDERS",
    label: "Manage Orders",
    component: ManageOrdersTab,
  },
  {
    key: "SETTINGS",
    label: "Settings",
    component: SettingsTab,
  },
  {
    key: "INVENTORY",
    label: "Inventory",
    component: InventoryTab,
  },
  {
    key: "LEDGER",
    label: "Ledger",
    component: LedgerTab,
  },
  {
    key: "EXPENSES",
    label: "Expenses",
    component: ExpensesTab,
  },
  {
    key: "REPORTS",
    label: "Reports",
    component: ReportsTab,
  },
  {
    key: "DATA",
    label: "Data",
    component: DataTab,
  },
  {
    key: "USER_MANAGEMENT",
    label: "Access",
    component: UserManagementTab,
  },
];

export const TAB_LABELS = TAB_DEFINITIONS.reduce((acc, tab) => {
  acc[tab.key] = tab.label;
  return acc;
}, {});
