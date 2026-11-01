import AuthGuard from "@/components/AuthGuard";
import Navbar from "@/components/Navbar";
import { Suspense } from "react";
import BoxClient from "./BoxClient";

export default function BoxPage() {
  return (
    <div className="spirit-theme sp-page sp-box-page">
      <div className="standard-site-header">
        <Navbar />
      </div>
      <div className="sp-box-access">
        <AuthGuard>
          <Suspense fallback={<div className="sp-box"><p className="sp-description">載入中…</p></div>}>
            <BoxClient />
          </Suspense>
        </AuthGuard>
      </div>
    </div>
  );
}
