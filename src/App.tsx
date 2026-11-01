import { useEffect, useState } from "react";
import { purgeDemoOrders, useSession } from "./lib/store";
import LoginScreen from "./components/LoginScreen";
import AppShell from "./components/AppShell";
import CloudSync from "./components/CloudSync";
import type { View } from "./components/AppShell";
import Dashboard from "./components/Dashboard";
import NewOrder from "./components/NewOrder";
import OrderHistory from "./components/OrderHistory";
import OrderDetail from "./components/OrderDetail";
import Services from "./components/Services";
import SettingsSmm from "./components/SettingsSmm";
import Admin from "./components/Admin";
import Settings from "./components/Settings";
import { Toaster } from "./components/Toast";

export default function App() {
  const session = useSession();
  const [view, setView] = useState<View>("dashboard");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  useEffect(() => {
    purgeDemoOrders();
  }, []);

  const openDetail = (id: string) => {
    setSelectedOrderId(id);
    setView("order-detail");
  };

  if (!session) {
    return (
      <>
        <LoginScreen />
        <Toaster />
      </>
    );
  }

  const effective: View = view === "admin" && !session.admin ? "dashboard" : view;

  return (
    <>
      <AppShell view={effective} onNavigate={setView}>
        {effective === "dashboard" && <Dashboard />}
        {effective === "new-order" && <NewOrder onDone={() => setView("orders")} />}
        {effective === "orders" && <OrderHistory onOpenDetail={openDetail} />}
        {effective === "order-detail" && selectedOrderId && (
          <OrderDetail orderId={selectedOrderId} onBack={() => setView("orders")} />
        )}
        {effective === "services" && <Services />}
        {effective === "smm-api" && <SettingsSmm />}
        {effective === "admin" && session.admin && <Admin />}
        {effective === "settings" && <Settings />}
      </AppShell>
      <CloudSync />
      <Toaster />
    </>
  );
}
