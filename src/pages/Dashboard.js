import React from "react";

export default function Dashboard() {
  console.log("DASHBOARD: hard render OK");

  return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 32 }}>DASHBOARD HARD TEST</h1>
      <p>If you see this, routing and rendering are working.</p>
    </div>
  );
}
