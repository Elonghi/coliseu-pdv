import { ImageResponse } from "next/og";

export const alt = "Coliseu PDV — gestão completa para lojas de TCG";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const modules = ["PDV", "ESTOQUE", "FINANCEIRO", "NF-e", "JOGADORES"];

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#f5f7fb", color: "#172036", fontFamily: "Arial, sans-serif", padding: "58px 64px" }}>
      <div style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", border: "1px solid #dfe4eb", background: "#ffffff", padding: "50px 54px", boxShadow: "0 20px 60px rgba(23, 32, 54, 0.10)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ width: 66, height: 66, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 14, background: "#172744", color: "#ffffff", fontSize: 34, fontWeight: 800 }}>C</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "#12a965", fontSize: 18, fontWeight: 800, letterSpacing: 5 }}>COLISEU</span>
              <span style={{ color: "#667085", fontSize: 18, fontWeight: 700 }}>PDV &amp; GESTÃO</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#344054", fontSize: 17, fontWeight: 700 }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: "#12b76a" }}/>
            Feito para lojas de TCG
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 930 }}>
          <div style={{ color: "#172036", fontSize: 58, lineHeight: 1.08, fontWeight: 800, letterSpacing: -2.2 }}>
            A gestão da sua loja de TCG em um só lugar.
          </div>
          <div style={{ marginTop: 20, color: "#667085", fontSize: 25, lineHeight: 1.35 }}>
            Venda com agilidade e controle estoque, financeiro, jogadores e notas fiscais sem depender de planilhas.
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          {modules.map((module) => <div key={module} style={{ display: "flex", alignItems: "center", padding: "10px 17px", border: "1px solid #d9e1e9", borderRadius: 8, color: "#344054", background: "#f8fafc", fontSize: 15, fontWeight: 800, letterSpacing: 0.7 }}>{module}</div>)}
        </div>
      </div>
    </div>,
    size,
  );
}
