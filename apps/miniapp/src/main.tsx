import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ToastProvider } from "./components/ui";
import "./index.css";
import { initTelegram } from "./lib/telegram";
import { queryClient } from "./lib/txflow";
import { WalletProvider } from "./wallet/WalletProvider";

initTelegram();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <WalletProvider>
          <App />
        </WalletProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
