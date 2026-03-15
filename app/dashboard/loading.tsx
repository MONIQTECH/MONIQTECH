export default function DashboardLoading() {
  return (
    <div style={{
      minHeight: "100vh", background: "#000",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>💸</div>
        <p style={{
          fontFamily: "-apple-system, 'SF Pro Display', sans-serif",
          color: "rgba(255,255,255,0.3)", fontSize: 14,
        }}>Loading...</p>
      </div>
    </div>
  );
}
