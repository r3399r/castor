import AuthGuard from "@/components/AuthGuard";
import Navbar from "@/components/Navbar";
import BoxClient from "./BoxClient";

export default function BoxPage() {
  return (
    <div className="spirit-theme sp-page sp-box-page">
      <div className="sp-navigation">
        <Navbar />
      </div>
      <div className="sp-box-access">
        <AuthGuard>
          <BoxClient />
        </AuthGuard>
      </div>
    </div>
  );
}
