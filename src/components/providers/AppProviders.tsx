"use client";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { WalletProviders } from "@/components/wallet/DeedWallet";
import { WalletPicker } from "@/components/wallet/WalletPicker";
import { ClockSync } from "@/components/layout/ClockSync";
import { DataProvider } from "./DataProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <WalletProviders>
        <DataProvider>
          <ClockSync />
          {children}
          <WalletPicker />
        </DataProvider>
      </WalletProviders>
    </ToastProvider>
  );
}
